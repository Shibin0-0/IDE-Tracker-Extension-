import type { IdeSource } from "@ide-usage-monitor/shared";
import path from "node:path";

/**
 * Mapping configuration linking an IDE source identifier to its known process and executable names.
 */
export interface IdeProcessMapping {
  /** The normalized IDE identifier ('vscode' | 'antigravity') */
  ide: IdeSource;
  /**
   * List of process names or executable names (case-insensitive, with or without .exe).
   */
  processNames: readonly string[];
}

/**
 * Verified default process and executable identities in the Windows environment:
 * - VS Code:
 *   - 'Code.exe' (default stable installation executable)
 *   - 'Code' (process name reported by Windows without extension)
 *   - 'Code - Insiders.exe' / 'Code - Insiders' (Insiders release)
 * - Antigravity:
 *   - 'Antigravity.exe' / 'Antigravity' (verified in AppData/Local/Programs/antigravity)
 *   - 'Antigravity IDE.exe' / 'Antigravity IDE' (verified in AppData/Local/Programs/Antigravity IDE)
 *   - 'Antigravity-x64.exe' / 'Antigravity-x64' (verified in AppData/Local/antigravity-updater/pending)
 */
export const DEFAULT_IDE_PROCESS_MAPPINGS: readonly IdeProcessMapping[] = [
  {
    ide: "vscode",
    processNames: [
      "code.exe",
      "code",
      "code - insiders.exe",
      "code - insiders",
      "code-insiders.exe",
      "code-insiders",
    ],
  },
  {
    ide: "antigravity",
    processNames: [
      "antigravity.exe",
      "antigravity",
      "antigravity ide.exe",
      "antigravity ide",
      "antigravity-ide.exe",
      "antigravity-ide",
      "antigravity-x64.exe",
      "antigravity-x64",
      "agy.exe",
      "agy",
    ],
  },
] as const;

/**
 * Configuration options for the IDE process registry.
 */
export interface IdeProcessRegistryOptions {
  /**
   * Optional custom mappings that override or supplement default process mappings.
   */
  customMappings?: readonly IdeProcessMapping[];
  /**
   * Additional comma-separated or array process names from environment or config.
   */
  extraVscodeProcessNames?: readonly string[];
  extraAntigravityProcessNames?: readonly string[];
}

/**
 * Registry responsible for identifying and normalizing process/executable names to supported IDEs.
 */
export class IdeProcessRegistry {
  private readonly mappings: readonly IdeProcessMapping[];

  public constructor(options?: IdeProcessRegistryOptions) {
    if (options?.customMappings && options.customMappings.length > 0) {
      this.mappings = options.customMappings;
    } else {
      // Build configurable mappings using defaults + optional extra process names
      const extraVscode = [
        ...(options?.extraVscodeProcessNames ?? []),
        ...(process.env["VSCODE_PROCESS_NAMES"]
          ?.split(",")
          .map((s) => s.trim()) ?? []),
      ].filter(Boolean);

      const extraAntigravity = [
        ...(options?.extraAntigravityProcessNames ?? []),
        ...(process.env["ANTIGRAVITY_PROCESS_NAMES"]
          ?.split(",")
          .map((s) => s.trim()) ?? []),
      ].filter(Boolean);

      this.mappings = [
        {
          ide: "vscode",
          processNames: [
            ...DEFAULT_IDE_PROCESS_MAPPINGS[0]!.processNames,
            ...extraVscode.map((n) => n.toLowerCase()),
          ],
        },
        {
          ide: "antigravity",
          processNames: [
            ...DEFAULT_IDE_PROCESS_MAPPINGS[1]!.processNames,
            ...extraAntigravity.map((n) => n.toLowerCase()),
          ],
        },
      ];
    }
  }

  /**
   * Resolves a raw process name, executable name, or full file path to a supported IDE.
   *
   * @param rawIdentity The raw process name or path reported by the OS (e.g., 'Code.exe', 'Antigravity')
   * @returns Normalized 'vscode' | 'antigravity' if recognized, or null otherwise.
   */
  public resolveIde(rawIdentity: string | null | undefined): IdeSource | null {
    if (!rawIdentity) {
      return null;
    }

    const trimmed = rawIdentity.trim();
    if (trimmed.length === 0) {
      return null;
    }

    // Extract filename if a full filesystem path was provided
    const baseName = path.basename(trimmed).toLowerCase();
    const nameWithoutExt = baseName.endsWith(".exe")
      ? baseName.slice(0, -4)
      : baseName;

    for (const mapping of this.mappings) {
      for (const pattern of mapping.processNames) {
        const normalizedPattern = pattern.toLowerCase();
        if (
          baseName === normalizedPattern ||
          nameWithoutExt === normalizedPattern
        ) {
          return mapping.ide;
        }
      }
    }

    return null;
  }
}
