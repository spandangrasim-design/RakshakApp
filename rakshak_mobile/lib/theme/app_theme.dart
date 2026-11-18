import 'package:flutter/material.dart';

/// Single source of truth for colours, type and component styles.
/// Identical file is used in rakshak_mobile and rakshak_field so both apps look like one product.
class AppColors {
  AppColors._();
  static const brand = Color(0xFF2748D6);
  static const brandDark = Color(0xFF1B2A6B);
  static const brandSoft = Color(0xFFEEF4FF);
  static const ink = Color(0xFF0F172A);
  static const inkSoft = Color(0xFF475569);
  static const inkMute = Color(0xFF94A3B8);
  static const line = Color(0xFFE2E8F0);
  static const bg = Color(0xFFF6F8FC);
  static const ok = Color(0xFF059669);
  static const okSoft = Color(0xFFECFDF5);
  static const warn = Color(0xFFD97706);
  static const warnSoft = Color(0xFFFFFBEB);
  static const danger = Color(0xFFE11D48);
  static const dangerSoft = Color(0xFFFFF1F2);
}

class AppTheme {
  AppTheme._();

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.brand,
      primary: AppColors.brand,
      error: AppColors.danger,
      surface: Colors.white,
    );
    const radius = 14.0;
    OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius),
          borderSide: BorderSide(color: c, width: w),
        );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.bg,
      visualDensity: VisualDensity.standard,
      // Platform fonts keep the APK small and look native. Add google_fonts later if you want Inter.
      textTheme: Typography.material2021().black.apply(
            bodyColor: AppColors.ink,
            displayColor: AppColors.ink,
          ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: false,
        titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.ink),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: AppColors.line),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: border(AppColors.line),
        enabledBorder: border(AppColors.line),
        focusedBorder: border(AppColors.brand, 1.6),
        errorBorder: border(AppColors.danger),
        focusedErrorBorder: border(AppColors.danger, 1.6),
        labelStyle: const TextStyle(color: AppColors.inkSoft),
      ),
      // 52dp tall = comfortable for gloves and small screens (Material minimum is 48).
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          backgroundColor: AppColors.brand,
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius)),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(0, 48),
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 48),
          foregroundColor: AppColors.brand,
          side: const BorderSide(color: AppColors.line),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.ink,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      dialogTheme: DialogThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.line, space: 1),
    );
  }
}
