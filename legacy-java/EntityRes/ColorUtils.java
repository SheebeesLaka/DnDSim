package EntityRes;

/**
 * Shared color helpers for model/UI color normalization and legacy conversion.
 */
public final class ColorUtils {

    public static final String DEFAULT_COLOR = "#808080";

    private static final String[] LEGACY_PALETTE = new String[] {
        "#000000", // Black
        "#808080", // Gray
        "#FFFFFF", // White
        "#8B0000", // Maroon
        "#FF0000", // Red
        "#FFA500", // Orange
        "#FFFF00", // Yellow
        "#00FF00", // Lime
        "#008000", // Green
        "#0000FF", // Blue
        "#4B0082", // Indigo
        "#C8A2C8", // Lilac
        "#800080", // Purple
        "#FFC0CB", // Pink
        "#F5F5DC", // Beige
        "#8B4513"  // Brown
    };

    private ColorUtils() {
    }

    public static String normalizeHex(String value, String fallback) {
        String safeFallback = normalizeFallback(fallback);
        if (value == null) {
            return safeFallback;
        }

        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return safeFallback;
        }

        if (isInteger(trimmed)) {
            return fromLegacyIndex(Integer.parseInt(trimmed));
        }

        String candidate = trimmed.startsWith("#") ? trimmed.substring(1) : trimmed;
        if (candidate.length() == 3 && isHex(candidate)) {
            // Expand shorthand #RGB to #RRGGBB
            char r = candidate.charAt(0);
            char g = candidate.charAt(1);
            char b = candidate.charAt(2);
            candidate = "" + r + r + g + g + b + b;
        }

        if (candidate.length() == 6 && isHex(candidate)) {
            return "#" + candidate.toUpperCase();
        }

        return safeFallback;
    }

    public static String fromLegacyIndex(int index) {
        if (index < 0 || index >= LEGACY_PALETTE.length) {
            return DEFAULT_COLOR;
        }
        return LEGACY_PALETTE[index];
    }

    public static int legacyPaletteSize() {
        return LEGACY_PALETTE.length;
    }

    public static String legacyHex(int index) {
        return fromLegacyIndex(index);
    }

    public static java.awt.Color toAwtColor(String value, String fallback) {
        String normalized = normalizeHex(value, fallback);
        return java.awt.Color.decode(normalized);
    }

    public static String toHex(javafx.scene.paint.Color color) {
        if (color == null) {
            return DEFAULT_COLOR;
        }

        int red = (int) Math.round(color.getRed() * 255.0);
        int green = (int) Math.round(color.getGreen() * 255.0);
        int blue = (int) Math.round(color.getBlue() * 255.0);
        return String.format("#%02X%02X%02X", red, green, blue);
    }

    private static String normalizeFallback(String fallback) {
        if (fallback == null || fallback.trim().isEmpty()) {
            return DEFAULT_COLOR;
        }
        String trimmed = fallback.trim();

        if (isInteger(trimmed)) {
            return fromLegacyIndex(Integer.parseInt(trimmed));
        }

        String candidate = trimmed.startsWith("#") ? trimmed.substring(1) : trimmed;
        if (candidate.length() == 3 && isHex(candidate)) {
            char r = candidate.charAt(0);
            char g = candidate.charAt(1);
            char b = candidate.charAt(2);
            candidate = "" + r + r + g + g + b + b;
        }

        if (candidate.length() == 6 && isHex(candidate)) {
            return "#" + candidate.toUpperCase();
        }

        return DEFAULT_COLOR;
    }

    private static boolean isInteger(String value) {
        int start = (value.startsWith("-") || value.startsWith("+")) ? 1 : 0;
        if (start >= value.length()) {
            return false;
        }
        for (int i = start; i < value.length(); i++) {
            if (!Character.isDigit(value.charAt(i))) {
                return false;
            }
        }
        return true;
    }

    private static boolean isHex(String value) {
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            boolean digit = ch >= '0' && ch <= '9';
            boolean lower = ch >= 'a' && ch <= 'f';
            boolean upper = ch >= 'A' && ch <= 'F';
            if (!digit && !lower && !upper) {
                return false;
            }
        }
        return true;
    }
}