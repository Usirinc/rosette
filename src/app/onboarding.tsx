"use client";

import * as React from "react";
import { InfoIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/toolcraft/ui";
import { cn } from "@/toolcraft/ui/lib/utils";

// App-shell UI, not a schema control: this is a plain React overlay mounted
// as a sibling of <ToolcraftApp/> (see routes/index.tsx), per
// core/runtime-boundary.md's "Allowed Extension Points" -- an onboarding
// dialog is not a control, panel, toolbar, or canvas shell, so it does not
// belong in app-schema.ts and is not one of the runtime surfaces that must
// not be hand-composed. It uses the existing Toolcraft `Dialog` composite
// (src/toolcraft/ui/components/composites/dialog.tsx) purely for consistent
// chrome/theming with the rest of the app.
const ROSETTE_ONBOARDING_STORAGE_KEY = "rosette.onboarding.seen.v1";

type RosetteOnboardingStep = {
  body: string;
  title: string;
};

// One short sentence per step -- a quick orientation, not documentation.
// Step titles after the intro match this app's actual controls-panel section
// titles/order in src/app/app-schema.ts (Source, Zoom, Halftone, Channels,
// Screen Angles, Tone, Appearance, then the mandatory Background + Image
// Export sections combined into one closing step) so the tour reads as a
// walkthrough of the real panel, not a generic feature list.
const ROSETTE_ONBOARDING_STEPS: readonly RosetteOnboardingStep[] = [
  {
    body: "Rosette turns any photo into a CMYK color halftone print effect -- the classic Photoshop Color Halftone look, fully tunable. Here's a quick tour of the controls panel.",
    title: "Welcome to Rosette",
  },
  {
    body: "Upload the photo you want to convert.",
    title: "Source",
  },
  {
    body: "Reframe the photo by scaling in from its cover-fit crop.",
    title: "Zoom",
  },
  {
    body: "Choose the halftone dot size and dot shape.",
    title: "Halftone",
  },
  {
    body: "Toggle Cyan, Magenta, Yellow, and Black, and choose how black ink is generated.",
    title: "Channels",
  },
  {
    body: "Rotate each channel's dot screen independently, just like real print screens.",
    title: "Screen Angles",
  },
  {
    body: "Adjust contrast, brightness, and invert before the halftone effect is applied.",
    title: "Tone",
  },
  {
    body: "Paint the background behind the dots with a solid color or an adjustable gradient.",
    title: "Appearance",
  },
  {
    body: "Include the background and export your finished PNG at 2K, 4K, or 8K.",
    title: "Background & Image Export",
  },
];

function readRosetteOnboardingSeen(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(ROSETTE_ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    // Storage blocked (private browsing, quota, disabled): fail closed so a
    // storage error cannot force the splash open on every load.
    return true;
  }
}

function writeRosetteOnboardingSeen(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(ROSETTE_ONBOARDING_STORAGE_KEY, "1");
  } catch {
    // Ignore: the tour simply reopens next visit instead of persisting.
  }
}

export function RosetteOnboarding(): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);

  // Gate the automatic first-visit show on localStorage, checked only after
  // mount so this never disagrees between server/first paint and client.
  React.useEffect(() => {
    if (!readRosetteOnboardingSeen()) {
      setOpen(true);
    }
  }, []);

  const lastStepIndex = ROSETTE_ONBOARDING_STEPS.length - 1;
  const step = ROSETTE_ONBOARDING_STEPS[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === lastStepIndex;

  const closeAndMarkSeen = React.useCallback(() => {
    writeRosetteOnboardingSeen();
    setOpen(false);
  }, []);

  // Standard dialog dismiss (outside click, Escape) fires onOpenChange(false)
  // exactly like clicking Skip/Done, so every dismissal path marks the tour
  // seen and none of them block interaction with the app underneath.
  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        closeAndMarkSeen();
        return;
      }

      setOpen(true);
    },
    [closeAndMarkSeen],
  );

  function handleReopen(): void {
    setStepIndex(0);
    setOpen(true);
  }

  function goBack(): void {
    setStepIndex((index) => Math.max(0, index - 1));
  }

  function goNextOrFinish(): void {
    if (isLastStep) {
      closeAndMarkSeen();
      return;
    }

    setStepIndex((index) => Math.min(lastStepIndex, index + 1));
  }

  return (
    <>
      {/* Small persistent reopen affordance. Placed top-left, deliberately
          away from the runtime toolbar (bottom-center) and the Controls
          panel (docked right) per this app's established layout, and built
          as a plain fixed-position button rather than injected into the
          shared runtime toolbar (a hands-off runtime surface). */}
      <button
        aria-label="About Rosette and controls tour"
        className={cn(
          "fixed top-3 left-3 z-40 inline-flex size-7 items-center justify-center rounded-full",
          "border border-[color:color-mix(in_oklab,var(--border)_18%,transparent)]",
          "bg-[color:color-mix(in_oklab,var(--popover)_92%,transparent)] text-[color:var(--muted-foreground)]",
          "shadow-sm backdrop-blur-sm transition-colors hover:text-[color:var(--foreground)]",
        )}
        data-testid="rosette-onboarding-reopen"
        onClick={handleReopen}
        type="button"
      >
        <InfoIcon size={15} weight="bold" />
        <span className="sr-only">About Rosette and controls tour</span>
      </button>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent data-testid="rosette-onboarding-dialog">
          <DialogHeader>
            {/* Keyed on stepIndex so each step's entrance gets a subtle fade
                -- deliberately not wrapped in AnimatePresence/mode="wait":
                that pattern defers mounting the new keyed child until the
                previous one's exit animation completes, which held the
                title/description frozen on the outgoing step in manual
                testing. A plain keyed motion.div swaps content immediately
                and only animates the incoming step in. */}
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 4 }}
              key={stepIndex}
              transition={{ duration: 0.16 }}
            >
              <DialogTitle>{step.title}</DialogTitle>
              <DialogDescription>{step.body}</DialogDescription>
            </motion.div>
          </DialogHeader>

          <DialogBody>
            <div
              aria-label={`Step ${stepIndex + 1} of ${ROSETTE_ONBOARDING_STEPS.length}`}
              className="flex items-center justify-center gap-1.5"
              role="presentation"
            >
              {ROSETTE_ONBOARDING_STEPS.map((dotStep, index) => (
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full transition-colors",
                    index === stepIndex
                      ? "bg-[color:var(--foreground)]"
                      : "bg-[color:color-mix(in_oklab,var(--foreground)_20%,transparent)]",
                  )}
                  key={dotStep.title}
                />
              ))}
            </div>
          </DialogBody>

          <DialogFooter justify="between">
            <Button onClick={closeAndMarkSeen} size="sm" type="button" variant="ghost">
              Skip
            </Button>
            <div className="flex gap-2">
              <Button
                disabled={isFirstStep}
                onClick={goBack}
                size="sm"
                type="button"
                variant="outline"
              >
                Back
              </Button>
              <Button onClick={goNextOrFinish} size="sm" type="button">
                {isLastStep ? "Done" : "Next"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const ROSETTE_ONBOARDING_STEP_COUNT = ROSETTE_ONBOARDING_STEPS.length;
