import { Volume2, VolumeOff, RotateCcw } from "lucide-react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@poc-bun-orpc-mediasoup/ui/components/context-menu";
import { Slider } from "@poc-bun-orpc-mediasoup/ui/components/slider";
import type { VolumeSettings } from "@/hooks/use-volume-settings";

export function VolumeContextMenu({
  peerId,
  volumeSettings,
  children,
}: {
  peerId: string;
  volumeSettings: VolumeSettings;
  children: React.ReactNode;
}) {
  const settings = volumeSettings.getSettings(peerId);

  return (
    <ContextMenu>
      <ContextMenuTrigger className="h-full w-full">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56 p-2">
        <ContextMenuGroup>
          <ContextMenuLabel className="px-1 py-1 text-xs font-medium">
            {peerId}
          </ContextMenuLabel>
        </ContextMenuGroup>
        <ContextMenuSeparator />

        {/* Volume slider */}
        <div className="flex items-center gap-2 px-1 py-2">
          <button
            onClick={() => volumeSettings.setMuted(peerId, !settings.muted)}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            {settings.muted ? (
              <VolumeOff className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>
          <Slider
            min={0}
            max={200}
            step={1}
            value={[settings.muted ? 0 : settings.volume]}
            onValueChange={(val) => {
              const v = Array.isArray(val) ? val[0] : val;
              if (settings.muted) volumeSettings.setMuted(peerId, false);
              volumeSettings.setVolume(peerId, v);
            }}
          />
          <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
            {settings.muted ? "0%" : `${settings.volume}%`}
          </span>
        </div>

        {/* Reset button */}
        {(settings.volume !== 100 || settings.muted) && (
          <>
            <ContextMenuSeparator />
            <button
              onClick={() => {
                volumeSettings.setVolume(peerId, 100);
                volumeSettings.setMuted(peerId, false);
              }}
              className="flex w-full items-center gap-2 rounded-none px-1 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to 100%
            </button>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
