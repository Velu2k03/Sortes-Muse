'use client';

import React, { type CSSProperties, type ReactNode } from 'react';
import { Select } from '@base-ui-components/react/select';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, Tick02Icon } from '@hugeicons/core-free-icons';

export interface GlideSelectOption {
  value: string;
  label: ReactNode;
  tag?: string;
}

export interface GlideSelectProps {
  options?: (string | GlideSelectOption)[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, option: GlideSelectOption) => void;
  placeholder?: string;
  showTags?: boolean;
  accentColor?: string;
  surfaceColor?: string;
  highlightColor?: string;
  textColor?: string;
  size?: 'sm' | 'md' | 'lg';
  radius?: number;
  menuWidth?: number;
  placement?: 'top' | 'bottom';
  align?: 'left' | 'right';
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

const SIZES: Record<string, { chip: number; row: number; font: number }> = {
  sm: { chip: 28, row: 26, font: 12 },
  md: { chip: 32, row: 30, font: 13 },
  lg: { chip: 44, row: 40, font: 14 }
};
const DEFAULT_OPTIONS: (string | GlideSelectOption)[] = ['One', 'Two', 'Three'];

const norm = (o: string | GlideSelectOption): GlideSelectOption => (typeof o === 'string' ? { value: o, label: o } : o);

/**
 * All-pages fix 5 (base-ui refactor, 2026-11-17): the select shell
 * is base-ui Select, which owns the listbox semantics, focus
 * management, typeahead, keyboard (arrows/Home/End/Enter/Escape),
 * outside dismissal, and side flipping. The old hand-rolled
 * version (~380 lines: pointer-scrub selection, a gliding
 * highlight pill that chased the active row, a swap animation on
 * the trigger value, manual side flipping) is gone.
 *
 * Deliberate trade-offs, disclosed: the gliding pill and the
 * pointer-scrub gesture are gone, the highlighted row now gets
 * the highlight background directly (data-highlighted) and the
 * selected row keeps the gold tick. The popDuration / glideDuration
 * / rememberPosition props are gone with them; the popup
 * transition is a fixed 180ms (the old popDuration default),
 * inside the transitions.dev 150-250ms band, and base-ui always
 * highlights the selected item when the popup opens, which is
 * what rememberPosition=true did. The public contract is
 * unchanged: same options/value/defaultValue/onChange/placeholder/
 * colours/sizes/placement/disabled/ariaLabel props, same call
 * sites in ChartSections (system picker, birthplace picker), same
 * Sortes tokens on the trigger and the popup. Base-ui Select is
 * non-modal here (modal={false}), so opening it does not lock
 * page scroll, as before.
 *
 * Portal fix (PR #148 blocker, 2026-11-18): Select.Portal mounts
 * the popup under document.body, outside the wrapper div, so CSS
 * custom properties set only on the wrapper never reach it -- the
 * popup rendered transparent, ~108px wide instead of the 176px
 * menuWidth, with page text showing through. The --gs-* variables
 * therefore live in one shared `themeVars` object set on BOTH the
 * wrapper (trigger) and Select.Popup (portaled popup and items).
 * Do not move them back to the wrapper alone.
 */
const GlideSelect: React.FC<GlideSelectProps> = ({
  options = DEFAULT_OPTIONS,
  value,
  defaultValue,
  onChange,
  placeholder = 'Select…',
  showTags = true,
  accentColor = '#d4af37',
  surfaceColor = '#1a1f2e',
  highlightColor = '#3a3120',
  textColor = '#ede6d6',
  size = 'md',
  radius = 10,
  menuWidth = 176,
  placement = 'bottom',
  align = 'left',
  disabled = false,
  ariaLabel = 'Select',
  className = ''
}) => {
  const items = options.map(norm);
  const S = SIZES[size] ?? SIZES.md;

  // One shared theme object: the trigger reads the --gs-* vars
  // from the wrapper, the popup reads them from Select.Popup --
  // see the portal fix in the header comment. Both must stay.
  const themeVars = {
    '--gs-accent': accentColor,
    '--gs-surface': surfaceColor,
    '--gs-highlight': highlightColor,
    '--gs-text': textColor,
    '--gs-radius': `${radius}px`,
    '--gs-inner-radius': `${Math.max(3, radius - 4)}px`,
    '--gs-chip': `${S.chip}px`,
    '--gs-row': `${S.row}px`,
    '--gs-font': `${S.font}px`,
    '--gs-menu-w': `${menuWidth}px`
  } as CSSProperties;

  return (
    <div
      className={`group relative inline-block data-[disabled]:opacity-50${className ? ` ${className}` : ''}`}
      data-size={size}
      data-disabled={disabled ? '' : undefined}
      style={themeVars}
    >
      <Select.Root
        items={items}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(v) => {
          if (v == null) return;
          const it = items.find((x) => x.value === v);
          if (it) onChange?.(v, it);
        }}
        disabled={disabled}
        modal={false}
      >
        <Select.Trigger
          aria-label={ariaLabel}
          className="group/trigger relative m-0 inline-flex cursor-pointer touch-manipulation items-center gap-1.5 border-0 pr-2 pl-2.5 leading-none font-medium outline-none select-none [-webkit-tap-highlight-color:transparent] [font-family:inherit] [height:var(--gs-chip)] [border-radius:var(--gs-inner-radius)] [background:var(--gs-surface)] [color:var(--gs-text)] [font-size:var(--gs-font)] [transition:background-color_100ms_ease,transform_160ms_cubic-bezier(0.23,1,0.32,1)] disabled:cursor-default enabled:active:scale-[0.97] motion-reduce:enabled:active:scale-100 motion-reduce:[transition:background-color_100ms_ease] data-[popup-open]:[background:color-mix(in_srgb,var(--gs-highlight)_60%,var(--gs-surface))] [@media(hover:hover)_and_(pointer:fine)]:enabled:hover:[background:color-mix(in_srgb,var(--gs-highlight)_60%,var(--gs-surface))]"
        >
          {/* The value label is resolved here, not via the
              placeholder prop: value "" is a real item in the
              birthplace picker ("Choose a birthplace…"), so an
              empty string must show that item's label, not the
              placeholder. No value at all shows the placeholder. */}
          <Select.Value>
            {(v: string | undefined) => {
              const it = items.find((x) => x.value === v);
              return it ? it.label : placeholder;
            }}
          </Select.Value>
          <Select.Icon className="inline-flex [color:color-mix(in_srgb,var(--gs-text)_55%,transparent)] [transition:transform_200ms_cubic-bezier(0.23,1,0.32,1)] group-data-[popup-open]/trigger:rotate-180 motion-reduce:transition-none">
            <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2.5} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            alignItemWithTrigger={false}
            side={placement}
            // Base-ui aligns to the anchor's start/end, not left/right.
            align={align === "left" ? "start" : "end"}
            className="z-20 outline-none"
          >
            <Select.Popup
              style={themeVars}
              className="min-w-full p-1 opacity-100 [width:var(--gs-menu-w)] [border-radius:var(--gs-radius)] [background:var(--gs-surface)] [box-shadow:0_4px_16px_color-mix(in_srgb,#000_22%,transparent)] [transition:opacity_180ms_cubic-bezier(0.23,1,0.32,1),transform_180ms_cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0"
            >
              <Select.List className="relative grid gap-px outline-none">
                {items.map((it) => (
                  <Select.Item
                    key={it.value}
                    value={it.value}
                    className="relative z-[1] flex cursor-pointer items-center gap-2 pr-2 pl-2.5 select-none [-webkit-tap-highlight-color:transparent] [height:var(--gs-row)] [border-radius:var(--gs-inner-radius)] [color:var(--gs-text)] [font-size:var(--gs-font)] [transition:background-color_150ms_ease] data-[highlighted]:[background:var(--gs-highlight)] data-[selected]:font-medium"
                  >
                    <Select.ItemText className="min-w-0 flex-1 truncate font-medium">
                      {it.label}
                    </Select.ItemText>
                    {showTags && it.tag ? (
                      <span className="shrink-0 [color:color-mix(in_srgb,var(--gs-text)_55%,transparent)] [font-size:calc(var(--gs-font)_-_2px)]">
                        {it.tag}
                      </span>
                    ) : null}
                    <Select.ItemIndicator className="inline-flex shrink-0 [color:var(--gs-accent)]">
                      <HugeiconsIcon icon={Tick02Icon} size={13} strokeWidth={2.5} />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
};

export default GlideSelect;
