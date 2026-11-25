export type HalftoneDotShape = "circle" | "square" | "diamond" | "line";
export type HalftoneBlackGeneration = "gcr" | "additive";
export type HalftoneBackgroundStyle = "solid" | "gradient";
export type HalftoneGradientType = "linear" | "radial" | "angular" | "diamond";

export type HalftoneChannelParams = {
  angleDeg: number;
  enabled: boolean;
};

export type HalftoneGradientStop = {
  colorHex: string;
  opacityPercent: number;
  positionPercent: number;
};

export type HalftoneBackgroundGradient = {
  angleDeg: number;
  gradientType: HalftoneGradientType;
  stops: readonly HalftoneGradientStop[];
};

export type HalftoneParams = {
  backgroundColor: string;
  backgroundGradient: HalftoneBackgroundGradient;
  backgroundStyle: HalftoneBackgroundStyle;
  blackGeneration: HalftoneBlackGeneration;
  brightness: number;
  channels: {
    black: HalftoneChannelParams;
    cyan: HalftoneChannelParams;
    magenta: HalftoneChannelParams;
    yellow: HalftoneChannelParams;
  };
  contrast: number;
  dotShape: HalftoneDotShape;
  includeBackground: boolean;
  invert: boolean;
  maxRadiusPx: number;
  photoZoomPercent: number;
};

// User-tuned defaults, exported from the app's own "Export Settings" action
// and promoted to schema defaultValue (what a fresh session and "Reset"
// restore to). These are no longer the stock Photoshop Color Halftone
// defaults -- the one deliberate departure is Max Radius, set to the new 1px
// slider floor (lower than the tuned export's 2px) because the user asked
// for headroom to go finer than the previous 2px hard minimum.
export const HALFTONE_DEFAULT_PARAMS: HalftoneParams = {
  backgroundColor: "#FFFFFF",
  backgroundGradient: {
    angleDeg: 90,
    gradientType: "linear",
    stops: [
      { colorHex: "#FFFFFF", opacityPercent: 100, positionPercent: 0 },
      { colorHex: "#D9D9D9", opacityPercent: 100, positionPercent: 100 },
    ],
  },
  backgroundStyle: "solid",
  blackGeneration: "additive",
  brightness: -5,
  channels: {
    black: { angleDeg: 45, enabled: true },
    cyan: { angleDeg: 160, enabled: true },
    magenta: { angleDeg: 162, enabled: true },
    yellow: { angleDeg: 90, enabled: true },
  },
  contrast: 16,
  dotShape: "circle",
  includeBackground: true,
  invert: false,
  maxRadiusPx: 1,
  photoZoomPercent: 100,
};

export const HALFTONE_CONTROL_TARGETS = {
  angleBlack: "angles.black",
  angleCyan: "angles.cyan",
  angleMagenta: "angles.magenta",
  angleYellow: "angles.yellow",
  backgroundColor: "appearance.background",
  backgroundGradient: "appearance.backgroundGradient",
  backgroundStyle: "appearance.fillStyle",
  blackGeneration: "channels.blackGeneration",
  brightness: "tone.brightness",
  contrast: "tone.contrast",
  dotShape: "halftone.dotShape",
  enabledBlack: "channels.black.enabled",
  enabledCyan: "channels.cyan.enabled",
  enabledMagenta: "channels.magenta.enabled",
  enabledYellow: "channels.yellow.enabled",
  exportFormat: "export.image.format",
  exportResolution: "export.image.resolution",
  includeBackground: "export.includeBackground",
  invert: "tone.invert",
  maxRadius: "halftone.maxRadius",
  photoZoom: "framing.zoom",
  sourceImage: "source.image",
} as const;

export function getHalftoneDotShapeMode(shape: HalftoneDotShape): number {
  switch (shape) {
    case "square":
      return 1;
    case "diamond":
      return 2;
    case "line":
      return 3;
    case "circle":
    default:
      return 0;
  }
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const hexColorPattern = /^#[0-9a-fA-F]{3,8}$/;

// The runtime `color` control commits its value as `{ hex: string }` (see
// ColorControlInput.onValueChange in the copied Toolcraft color control),
// not as a plain string, even though schema `defaultValue` may be authored
// as a plain hex string before the control is first touched.
function readHexColor(value: unknown, fallback: string): string {
  if (typeof value === "string" && hexColorPattern.test(value)) {
    return value;
  }

  if (
    value !== null &&
    typeof value === "object" &&
    "hex" in value &&
    typeof (value as { hex: unknown }).hex === "string" &&
    hexColorPattern.test((value as { hex: string }).hex)
  ) {
    return (value as { hex: string }).hex;
  }

  return fallback;
}

function readGradientType(
  value: unknown,
  fallback: HalftoneGradientType,
): HalftoneGradientType {
  return value === "linear" || value === "radial" || value === "angular" || value === "diamond"
    ? value
    : fallback;
}

function parseGradientStopPercent(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(100, Math.max(0, value));
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);

    if (Number.isFinite(parsed)) {
      return Math.min(100, Math.max(0, parsed));
    }
  }

  return fallback;
}

// The runtime `gradient` control commits its value already normalized as
// `{ angle, gradientType, stops }` (see asGradientValue in the copied
// Toolcraft controls-panel source), with each stop as
// `{ color, opacity?, position }` where `position` is a percent string such
// as "46%". This reads that same shape defensively (it is also the shape of
// this control's own schema `defaultValue`, authored in params.ts below).
function readGradientStops(
  value: unknown,
  fallback: readonly HalftoneGradientStop[],
): HalftoneGradientStop[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [...fallback];
  }

  const stops = value
    .map((entry, index): HalftoneGradientStop | null => {
      if (entry === null || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const fallbackStop = fallback[index] ?? fallback[fallback.length - 1];
      const colorHex =
        typeof record.color === "string" && hexColorPattern.test(record.color)
          ? record.color
          : (fallbackStop?.colorHex ?? "#FFFFFF");
      const opacityPercent =
        typeof record.opacity === "number" && Number.isFinite(record.opacity)
          ? Math.min(100, Math.max(0, record.opacity))
          : (fallbackStop?.opacityPercent ?? 100);
      const positionPercent = parseGradientStopPercent(
        record.position,
        fallbackStop?.positionPercent ?? 0,
      );

      return { colorHex, opacityPercent, positionPercent };
    })
    .filter((stop): stop is HalftoneGradientStop => stop !== null);

  return stops.length > 0 ? stops : [...fallback];
}

function readBackgroundGradient(
  value: unknown,
  fallback: HalftoneBackgroundGradient,
): HalftoneBackgroundGradient {
  if (value === null || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;

  return {
    angleDeg: readNumber(record.angle, fallback.angleDeg),
    gradientType: readGradientType(record.gradientType, fallback.gradientType),
    stops: readGradientStops(record.stops, fallback.stops),
  };
}

export function readHalftoneParamsFromValues(
  values: Record<string, unknown>,
): HalftoneParams {
  const t = HALFTONE_CONTROL_TARGETS;

  return {
    backgroundColor: readHexColor(
      values[t.backgroundColor],
      HALFTONE_DEFAULT_PARAMS.backgroundColor,
    ),
    backgroundGradient: readBackgroundGradient(
      values[t.backgroundGradient],
      HALFTONE_DEFAULT_PARAMS.backgroundGradient,
    ),
    backgroundStyle: readString(
      values[t.backgroundStyle],
      ["solid", "gradient"],
      HALFTONE_DEFAULT_PARAMS.backgroundStyle,
    ),
    blackGeneration: readString(
      values[t.blackGeneration],
      ["gcr", "additive"],
      HALFTONE_DEFAULT_PARAMS.blackGeneration,
    ),
    brightness: readNumber(values[t.brightness], HALFTONE_DEFAULT_PARAMS.brightness),
    channels: {
      black: {
        angleDeg: readNumber(
          values[t.angleBlack],
          HALFTONE_DEFAULT_PARAMS.channels.black.angleDeg,
        ),
        enabled: readBoolean(
          values[t.enabledBlack],
          HALFTONE_DEFAULT_PARAMS.channels.black.enabled,
        ),
      },
      cyan: {
        angleDeg: readNumber(
          values[t.angleCyan],
          HALFTONE_DEFAULT_PARAMS.channels.cyan.angleDeg,
        ),
        enabled: readBoolean(
          values[t.enabledCyan],
          HALFTONE_DEFAULT_PARAMS.channels.cyan.enabled,
        ),
      },
      magenta: {
        angleDeg: readNumber(
          values[t.angleMagenta],
          HALFTONE_DEFAULT_PARAMS.channels.magenta.angleDeg,
        ),
        enabled: readBoolean(
          values[t.enabledMagenta],
          HALFTONE_DEFAULT_PARAMS.channels.magenta.enabled,
        ),
      },
      yellow: {
        angleDeg: readNumber(
          values[t.angleYellow],
          HALFTONE_DEFAULT_PARAMS.channels.yellow.angleDeg,
        ),
        enabled: readBoolean(
          values[t.enabledYellow],
          HALFTONE_DEFAULT_PARAMS.channels.yellow.enabled,
        ),
      },
    },
    contrast: readNumber(values[t.contrast], HALFTONE_DEFAULT_PARAMS.contrast),
    dotShape: readString(
      values[t.dotShape],
      ["circle", "square", "diamond", "line"],
      HALFTONE_DEFAULT_PARAMS.dotShape,
    ),
    includeBackground: readBoolean(
      values[t.includeBackground],
      HALFTONE_DEFAULT_PARAMS.includeBackground,
    ),
    invert: readBoolean(values[t.invert], HALFTONE_DEFAULT_PARAMS.invert),
    maxRadiusPx: readNumber(values[t.maxRadius], HALFTONE_DEFAULT_PARAMS.maxRadiusPx),
    photoZoomPercent: readNumber(
      values[t.photoZoom],
      HALFTONE_DEFAULT_PARAMS.photoZoomPercent,
    ),
  };
}
