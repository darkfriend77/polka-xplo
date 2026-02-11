import fs from "node:fs/promises";
import path from "node:path";
import type {
  PalletExtension,
  ExtensionManifest,
  BlockContext,
  Block,
  Extrinsic,
  ExplorerEvent,
} from "@polka-xplo/shared";
import { query } from "@polka-xplo/db";

/**
 * The Plugin Registry manages extension lifecycle:
 * - Discovery: scans /extensions directory for manifests
 * - Registration: validates and loads extension handlers
 * - Dispatch: routes blocks/extrinsics/events to matching plugins
 * - Migration: runs extension-specific SQL migrations
 */
export class PluginRegistry {
  private extensions = new Map<string, PalletExtension>();
  private eventIndex = new Map<string, PalletExtension[]>();
  private callIndex = new Map<string, PalletExtension[]>();

  /** Discover and load extensions from the extensions directory */
  async discover(extensionsDir: string): Promise<void> {
    try {
      await fs.access(extensionsDir);
    } catch {
      console.log("[Registry] No extensions directory found. Using defaults only.");
      return;
    }

    const entries = await fs.readdir(extensionsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const manifestPath = path.join(extensionsDir, entry.name, "manifest.json");
      try {
        await fs.access(manifestPath);
      } catch {
        console.warn(`[Registry] Skipping ${entry.name}: no manifest.json`);
        continue;
      }

      try {
        const manifestRaw = await fs.readFile(manifestPath, "utf-8");
        const manifest: ExtensionManifest = JSON.parse(manifestRaw);

        console.log(`[Registry] Found extension: ${manifest.name} (${manifest.id})`);

        // Load the extension handler module (compiled output in dist/)
        const handlerPath = path.join(extensionsDir, entry.name, "dist", "indexer", "event-handlers.js");

        let extension: PalletExtension = { manifest };

        let handlerExists = false;
        try {
          await fs.access(handlerPath);
          handlerExists = true;
        } catch {
          /* ignore */
        }

        if (handlerExists) {
          const module = await import(handlerPath);
          extension = {
            manifest,
            onEvent: module.onEvent,
            onExtrinsic: module.onExtrinsic,
            onBlock: module.onBlock,
            getMigrationSQL: module.getMigrationSQL,
          };
        }

        this.register(extension);
      } catch (err) {
        console.error(`[Registry] Failed to load extension ${entry.name}:`, err);
      }
    }
  }

  /** Register an extension and build dispatch indexes */
  register(extension: PalletExtension): void {
    const { manifest } = extension;
    this.extensions.set(manifest.id, extension);

    // Build event dispatch index
    for (const eventKey of manifest.supportedEvents) {
      const existing = this.eventIndex.get(eventKey) ?? [];
      existing.push(extension);
      this.eventIndex.set(eventKey, existing);
    }

    // Build call dispatch index
    for (const callKey of manifest.supportedCalls) {
      const existing = this.callIndex.get(callKey) ?? [];
      existing.push(extension);
      this.callIndex.set(callKey, existing);
    }

    console.log(
      `[Registry] Registered: ${manifest.name} — ` +
        `${manifest.supportedEvents.length} events, ${manifest.supportedCalls.length} calls`,
    );
  }

  /** Run pending SQL migrations for all extensions */
  async runMigrations(): Promise<void> {
    const newlyMigrated: PalletExtension[] = [];

    for (const [, ext] of this.extensions) {
      if (!ext.getMigrationSQL) continue;

      const migrationKey = `${ext.manifest.id}:${ext.manifest.version}`;

      // Check if already applied
      const result = await query(
        `SELECT 1 FROM extension_migrations WHERE extension_id = $1 AND version = $2`,
        [ext.manifest.id, ext.manifest.version],
      );

      if (result.rows.length > 0) continue;

      console.log(`[Registry] Running migration for ${ext.manifest.name} v${ext.manifest.version}`);

      const sql = ext.getMigrationSQL();
      await query(sql);
      await query(`INSERT INTO extension_migrations (extension_id, version) VALUES ($1, $2)`, [
        ext.manifest.id,
        ext.manifest.version,
      ]);

      console.log(`[Registry] Migration complete: ${migrationKey}`);
      newlyMigrated.push(ext);
    }

    // Backfill historical events for newly-migrated extensions
    for (const ext of newlyMigrated) {
      await this.backfillExtension(ext);
    }
  }

  /**
   * Backfill historical events for a newly-registered extension.
   * Reads matching events from the existing `events` table and replays
   * them through the extension's onEvent handler.
   */
  private async backfillExtension(ext: PalletExtension): Promise<{ processed: number; total: number }> {
    if (!ext.onEvent || ext.manifest.supportedEvents.length === 0) return { processed: 0, total: 0 };

    // Build list of (module, event) pairs from the manifest's supportedEvents
    // Format is "Module.EventName"
    const pairs = ext.manifest.supportedEvents.map((key) => {
      const [mod, evt] = key.split(".");
      return { module: mod, event: evt };
    });

    // Build a WHERE clause: (module = $1 AND event = $2) OR (module = $3 AND event = $4) ...
    const conditions: string[] = [];
    const params: string[] = [];
    for (const p of pairs) {
      params.push(p.module, p.event);
      conditions.push(`(module = $${params.length - 1} AND event = $${params.length})`);
    }

    const sql = `SELECT id, block_height, extrinsic_id, index, module, event, data,
                        phase_type, phase_index
                 FROM events
                 WHERE ${conditions.join(" OR ")}
                 ORDER BY block_height ASC, index ASC`;

    const result = await query(sql, params);
    const total = result.rows.length;

    if (total === 0) {
      console.log(`[Registry] Backfill ${ext.manifest.name}: no historical events found`);
      return { processed: 0, total: 0 };
    }

    console.log(`[Registry] Backfilling ${ext.manifest.name}: ${total} historical events...`);

    let processed = 0;
    for (const row of result.rows) {
      const ctx: BlockContext = {
        blockHeight: Number(row.block_height),
        blockHash: "",
        timestamp: null,
        specVersion: 0,
      };

      const phase =
        row.phase_type === "ApplyExtrinsic"
          ? { type: "ApplyExtrinsic" as const, index: Number(row.phase_index) }
          : row.phase_type === "Finalization"
            ? { type: "Finalization" as const }
            : { type: "Initialization" as const };

      const event: ExplorerEvent = {
        id: String(row.id),
        blockHeight: Number(row.block_height),
        extrinsicId: row.extrinsic_id ? String(row.extrinsic_id) : null,
        index: Number(row.index),
        module: String(row.module),
        event: String(row.event),
        data: row.data as Record<string, unknown>,
        phase,
      };

      try {
        await ext.onEvent!(ctx, event);
        processed++;
      } catch (err) {
        console.error(
          `[Registry] Backfill error in ${ext.manifest.name} at event ${event.id}:`,
          err,
        );
      }
    }

    console.log(
      `[Registry] Backfill complete for ${ext.manifest.name}: ${processed}/${total} events processed`,
    );
    return { processed, total };
  }

  /** Invoke all onBlock handlers */
  async invokeBlockHandlers(ctx: BlockContext, block: Block): Promise<void> {
    for (const [, ext] of this.extensions) {
      if (ext.onBlock) {
        try {
          await ext.onBlock(ctx, block);
        } catch (err) {
          console.error(`[Registry] Block handler error in ${ext.manifest.name}:`, err);
        }
      }
    }
  }

  /** Invoke matching onExtrinsic handlers */
  async invokeExtrinsicHandlers(ctx: BlockContext, extrinsic: Extrinsic): Promise<void> {
    const key = `${extrinsic.module}.${extrinsic.call}`;
    const handlers = this.callIndex.get(key) ?? [];

    for (const ext of handlers) {
      if (ext.onExtrinsic) {
        try {
          await ext.onExtrinsic(ctx, extrinsic);
        } catch (err) {
          console.error(`[Registry] Extrinsic handler error in ${ext.manifest.name}:`, err);
        }
      }
    }
  }

  /** Invoke matching onEvent handlers */
  async invokeEventHandlers(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
    const key = `${event.module}.${event.event}`;
    const handlers = this.eventIndex.get(key) ?? [];

    for (const ext of handlers) {
      if (ext.onEvent) {
        try {
          await ext.onEvent(ctx, event);
        } catch (err) {
          console.error(`[Registry] Event handler error in ${ext.manifest.name}:`, err);
        }
      }
    }
  }

  /** Get list of registered extensions */
  getExtensions(): ExtensionManifest[] {
    return Array.from(this.extensions.values()).map((e) => e.manifest);
  }

  /** Check if an extension is registered for a specific event */
  hasHandlerForEvent(module: string, event: string): boolean {
    return this.eventIndex.has(`${module}.${event}`);
  }

  /** Trigger backfill for a specific extension by ID (for manual / API use) */
  async backfillById(extensionId: string): Promise<{ processed: number; total: number }> {
    const ext = this.extensions.get(extensionId);
    if (!ext) throw new Error(`Extension not found: ${extensionId}`);
    return this.backfillExtension(ext);
  }
}
