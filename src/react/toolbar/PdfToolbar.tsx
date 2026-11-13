import type { ShortcutRegistry, ToolRegistry } from "@hussmartinez/sdk-core";
import { IconButton, type IconComponent, Toolbar, ToolbarGroup } from "@hussmartinez/ui/react";
import type { ReactNode } from "react";
import type { PdfTool, PdfToolContext } from "../../features/tool-types.js";
import { usePdfDocument, usePdfMessages } from "../hooks.js";

/**
 * Props for {@link PdfToolbar}.
 *
 * @public
 */
export interface PdfToolbarProps {
  /** The editor's tools, from `createToolRegistry`. */
  readonly registry: ToolRegistry<PdfTool>;
  /** The editor's shortcuts, for each button's `aria-keyshortcuts`. */
  readonly shortcuts?: ShortcutRegistry;
  /** What the tools run against. */
  readonly context: PdfToolContext;
  /** Icon components by name. */
  readonly icons: Readonly<Record<string, IconComponent>>;
  /** Runs a tool. Defaults to running it against `context`. */
  readonly onRun?: (tool: PdfTool) => void;
  /** Extra classes on the root. */
  readonly className?: string;
}

/**
 * The editor's toolbar: ui's `Toolbar`, one labelled group per toolbar group
 * of the registry and one button per tool, disabled when the tool can't
 * run, with the tool's shortcuts as `aria-keyshortcuts`. Arrow keys move
 * between the buttons, as ui's toolbar does, so it's one tab stop.
 *
 * @public
 */
export function PdfToolbar(props: PdfToolbarProps): ReactNode {
  const { registry, shortcuts, context, icons, onRun, className } = props;
  const messages = usePdfMessages();
  const snapshot = usePdfDocument();
  const state = { snapshot };
  // Tool labels and group names are keys of the catalogue, checked when the
  // tool is defined; custom keys a host adds fall back to the key itself.
  const t = messages.t as (key: string) => string;
  const run = onRun ?? ((tool: PdfTool) => void tool.run(context));
  if (registry.toolbar.length === 0) return null;
  return (
    <Toolbar label={messages.t("toolbar.label")} {...(className ? { className } : {})}>
      {registry.toolbar.map((group) => (
        <ToolbarGroup
          key={group.map((tool) => tool.id).join(" ")}
          label={t(`toolbar.groups.${group[0]?.group ?? "other"}`)}
        >
          {group
            .filter((tool) => tool.isAvailable?.(state) ?? true)
            .map((tool) => {
              const Icon = icons[tool.icon];
              const keys = shortcuts?.ariaKeyShortcuts(tool.id);
              return (
                <IconButton
                  key={tool.id}
                  data-hm-tool={tool.id}
                  label={t(tool.label)}
                  icon={Icon ? <Icon /> : null}
                  disabled={!(tool.isEnabled?.(state) ?? true)}
                  {...(keys ? { "aria-keyshortcuts": keys } : {})}
                  onClick={() => run(tool)}
                />
              );
            })}
        </ToolbarGroup>
      ))}
    </Toolbar>
  );
}
