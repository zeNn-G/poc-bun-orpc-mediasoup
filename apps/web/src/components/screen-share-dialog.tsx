import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@poc-bun-orpc-mediasoup/ui/components/dialog";
import { Button } from "@poc-bun-orpc-mediasoup/ui/components/button";
import { Monitor, Zap, Sparkles, Crown } from "lucide-react";
import type { ScreenQuality } from "@/hooks/use-media-session";

const QUALITY_OPTIONS: {
  value: ScreenQuality;
  label: string;
  resolution: string;
  fps: string;
  icon: typeof Monitor;
}[] = [
  { value: "480p", label: "Smooth", resolution: "854 x 480", fps: "30 fps", icon: Monitor },
  { value: "720p", label: "Balanced", resolution: "1280 x 720", fps: "30 fps", icon: Zap },
  { value: "1080p", label: "Crisp", resolution: "1920 x 1080", fps: "30 fps", icon: Sparkles },
  { value: "source", label: "Source", resolution: "Native", fps: "60 fps", icon: Crown },
];

interface ScreenShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (quality: ScreenQuality) => void;
}

export function ScreenShareDialog({ open, onOpenChange, onStart }: ScreenShareDialogProps) {
  const [selected, setSelected] = useState<ScreenQuality>("720p");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Screen Share</DialogTitle>
          <DialogDescription>
            Choose stream quality. You can change this while sharing.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {QUALITY_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setSelected(opt.value)}
                className={`group relative rounded-lg border p-3 text-left transition-all ${
                  isSelected
                    ? "border-foreground/20 bg-foreground/5 ring-1 ring-foreground/10"
                    : "border-border hover:border-foreground/15 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                      isSelected ? "bg-foreground/10" : "bg-muted"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${isSelected ? "text-foreground" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-foreground/80"}`}>
                      {opt.label}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{opt.resolution}</span>
                  <span className="text-border">|</span>
                  <span>{opt.fps}</span>
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            className="w-full"
            onClick={() => {
              onStart(selected);
              onOpenChange(false);
            }}
          >
            Start Sharing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
