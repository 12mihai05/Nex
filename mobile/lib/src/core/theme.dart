import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';

abstract final class NexColors {
  static const ember = Color(0xFFB73550);
  static const ink = Color(0xFF090A0C);
  static const charcoal = Color(0xFF14161A);
  static const bone = Color(0xFFCBD3DE);
  static const lightCard = Color(0xFFE6EBF2);
  static const moss = Color(0xFF98AE92);
}

abstract final class NexTheme {
  static SystemUiOverlayStyle systemBars(Brightness brightness) =>
      (brightness == Brightness.dark
              ? SystemUiOverlayStyle.light
              : SystemUiOverlayStyle.dark)
          .copyWith(
            statusBarColor: Colors.transparent,
            systemNavigationBarColor: brightness == Brightness.dark
                ? NexColors.ink
                : NexColors.bone,
          );
  static ThemeData get dark => _theme(Brightness.dark);
  static ThemeData get light => _theme(Brightness.light);

  static ThemeData _theme(Brightness brightness) {
    const background = NexColors.bone;
    const card = NexColors.lightCard;
    final dark = brightness == Brightness.dark;
    final scheme =
        ColorScheme.fromSeed(
          seedColor: NexColors.ember,
          brightness: brightness,
          surface: dark ? NexColors.ink : background,
        ).copyWith(
          primary: dark ? const Color(0xFFF0788F) : const Color(0xFFA22444),
          onPrimary: dark ? const Color(0xFF320713) : Colors.white,
          secondary: dark ? null : const Color(0xFF96314D),
          onSecondary: dark ? null : Colors.white,
          outline: dark ? null : const Color(0xFF748397),
          secondaryContainer: dark ? null : const Color(0xFF96314D),
          onSecondaryContainer: dark ? null : Colors.white,
          primaryContainer: dark
              ? const Color(0xFF552033)
              : const Color(0xFF96314D),
          onPrimaryContainer: dark ? const Color(0xFFFFDEE5) : Colors.white,
          onSurface: dark ? const Color(0xFFF5F1F2) : const Color(0xFF202734),
          onSurfaceVariant: dark
              ? const Color(0xFFC4BAC0)
              : const Color(0xFF4B5565),
          surfaceContainerLowest: dark ? null : card,
          surfaceContainerLow: dark ? null : const Color(0xFFEEF1F5),
          surfaceContainer: dark ? null : const Color(0xFFE0E5EC),
          surfaceContainerHigh: dark ? null : const Color(0xFFD5DDE7),
          surfaceContainerHighest: dark
              ? const Color(0xFF292329)
              : const Color(0xFFC7D1DE),
          outlineVariant: dark
              ? const Color(0xFF493D43)
              : const Color(0xFFA4AFBD),
        );
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: dark ? NexColors.ink : background,
      fontFamily: 'sans-serif',
      iconTheme: dark ? null : IconThemeData(color: scheme.onSurfaceVariant),
      iconButtonTheme: IconButtonThemeData(
        style: ButtonStyle(
          foregroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.disabled)
                ? scheme.onSurface.withValues(alpha: .38)
                : states.contains(WidgetState.selected)
                ? scheme.onPrimaryContainer
                : null,
          ),
          backgroundColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.selected)
                ? scheme.primaryContainer
                : null,
          ),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: dark ? NexColors.charcoal : card,
        surfaceTintColor: Colors.transparent,
        barrierColor: Colors.black.withValues(alpha: .64),
        elevation: 12,
        constraints: const BoxConstraints(maxWidth: 420),
        insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(28),
          side: BorderSide(color: scheme.outlineVariant.withValues(alpha: .7)),
        ),
        titleTextStyle: TextStyle(
          fontFamily: 'sans-serif',
          fontSize: 22,
          height: 1.2,
          fontWeight: FontWeight.w700,
          letterSpacing: -.5,
          color: scheme.onSurface,
        ),
        contentTextStyle: TextStyle(
          fontFamily: 'sans-serif',
          fontSize: 15,
          height: 1.5,
          color: scheme.onSurfaceVariant,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: scheme.surfaceContainerHighest,
        contentTextStyle: TextStyle(
          fontFamily: 'sans-serif',
          color: scheme.onSurface,
          fontSize: 14,
          height: 1.4,
        ),
        actionTextColor: scheme.primary,
        elevation: 6,
        insetPadding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        surfaceTintColor: Colors.transparent,
        systemOverlayStyle: systemBars(
          brightness,
        ).copyWith(systemNavigationBarColor: dark ? NexColors.ink : background),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
      ),
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
        color: dark ? NexColors.charcoal : card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: dark
              ? BorderSide.none
              : BorderSide(color: scheme.outlineVariant.withValues(alpha: .65)),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 68,
        elevation: 0,
        backgroundColor: (dark ? NexColors.ink : background).withValues(
          alpha: .96,
        ),
        indicatorColor: dark
            ? NexColors.ember.withValues(alpha: .16)
            : scheme.primary,
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: !dark && states.contains(WidgetState.selected)
                ? Colors.white
                : scheme.onSurface,
          ),
        ),
        labelTextStyle: WidgetStatePropertyAll(
          TextStyle(
            fontFamily: 'sans-serif',
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: scheme.onSurface,
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: dark ? NexColors.ember : scheme.primary,
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
        fillColor: dark ? NexColors.charcoal : card,
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
        backgroundColor: dark ? const Color(0xFF202329) : card,
        selectedColor: scheme.primaryContainer,
        labelStyle: TextStyle(
          fontFamily: 'sans-serif',
          color: scheme.onSurface,
        ),
        secondaryLabelStyle: TextStyle(
          fontFamily: 'sans-serif',
          color: scheme.onPrimaryContainer,
        ),
        checkmarkColor: dark ? scheme.primary : Colors.white,
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
