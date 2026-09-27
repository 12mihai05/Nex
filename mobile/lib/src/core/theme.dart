import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';

abstract final class NexColors {
  static const ember = Color(0xFF992D49);
  static const ink = Color(0xFF090A0C);
  static const charcoal = Color(0xFF14161A);
  static const bone = Color(0xFFF7F3ED);
  static const moss = Color(0xFF98AE92);
}

abstract final class NexTheme {
  static ThemeData get dark => _theme(Brightness.dark);
  static ThemeData get light => _theme(Brightness.light);

  static ThemeData _theme(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final scheme = ColorScheme.fromSeed(
      seedColor: NexColors.ember,
      brightness: brightness,
      surface: dark ? NexColors.ink : NexColors.bone,
    );
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: dark ? NexColors.ink : NexColors.bone,
      fontFamily: 'sans-serif',
      textTheme: TextTheme(
        displayLarge: TextStyle(
          fontSize: 42,
          height: 1.02,
          fontWeight: FontWeight.w700,
          letterSpacing: -1.8,
          color: scheme.onSurface,
        ),
        displaySmall: TextStyle(
          fontSize: 30,
          height: 1.08,
          fontWeight: FontWeight.w700,
          letterSpacing: -1.1,
          color: scheme.onSurface,
        ),
        headlineSmall: TextStyle(
          fontSize: 22,
          height: 1.15,
          fontWeight: FontWeight.w600,
          letterSpacing: -.5,
          color: scheme.onSurface,
        ),
        titleLarge: TextStyle(
          fontSize: 19,
          fontWeight: FontWeight.w600,
          letterSpacing: -.3,
          color: scheme.onSurface,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          height: 1.45,
          color: scheme.onSurface,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          height: 1.4,
          color: scheme.onSurfaceVariant,
        ),
        labelLarge: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          letterSpacing: .1,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: dark ? NexColors.charcoal : Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 68,
        elevation: 0,
        backgroundColor: (dark ? NexColors.ink : NexColors.bone).withValues(
          alpha: .96,
        ),
        indicatorColor: NexColors.ember.withValues(alpha: .16),
        labelTextStyle: WidgetStatePropertyAll(
          TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: scheme.onSurface,
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: NexColors.ember,
          foregroundColor: Colors.white,
          minimumSize: const Size(48, 52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: dark ? NexColors.charcoal : Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 16,
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: dark ? const Color(0xFF202329) : Colors.white,
        selectedColor: NexColors.ember.withValues(alpha: .18),
        side: BorderSide(color: scheme.outlineVariant),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
      ),
      pageTransitionsTheme: PageTransitionsTheme(
        builders: {
          TargetPlatform.android: const FadeForwardsPageTransitionsBuilder(),
          TargetPlatform.iOS: const CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }
}
