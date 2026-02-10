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

        // Load the extension handler module
        const handlerPath = path.join(
          extensionsDir,
          entry.name,
          "indexer",
          "event-handlers.js"
        );

        let extension: PalletExtension = { manifest };

        let handlerExists = false;
        try {
          await fs.access(handlerPath);
          handlerExists = true;
        } catch {}

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
        `${manifest.supportedEvents.length} events, ${manifest.supportedCalls.length} calls`
    );
  }

  /** Run pending SQL migrations for all extensions */
  async runMigrations(): Promise<void> {
    for (const [, ext] of this.extensions) {
      if (!ext.getMigrationSQL) continue;

      const migrationKey = `${ext.manifest.id}:${ext.manifest.version}`;

      // Check if already applied
      const result = await query(
        `SELECT 1 FROM extension_migrations WHERE extension_id = $1 AND version = $2`,
        [ext.manifest.id, ext.manifest.version]
      );

      if (result.rows.length > 0) continue;

      console.log(`[Registry] Running migration for ${ext.manifest.name} v${ext.manifest.version}`);

      const sql = ext.getMigrationSQL();
      await query(sql);
      await query(
        `INSERT INTO extension_migrations (extension_id, version) VALUES ($1, $2)`,
        [ext.manifest.id, ext.manifest.version]
      );

      console.log(`[Registry] Migration complete: ${migrationKey}`);
    }
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
  async invokeExtrinsicHandlers(
    ctx: BlockContext,
    extrinsic: Extrinsic
  ): Promise<void> {
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
  async invokeEventHandlers(
    ctx: BlockContext,
    event: ExplorerEvent
  ): Promise<void> {
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
}
