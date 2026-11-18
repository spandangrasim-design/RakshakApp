import 'package:flutter/material.dart';

/// Wrap a screen's content so it stays readable on tablets/foldables/landscape:
/// full-width on phones, centred and capped on big screens.
class ResponsiveBody extends StatelessWidget {
  final Widget child;
  final double maxWidth;
  const ResponsiveBody({super.key, required this.child, this.maxWidth = 640});

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(constraints: BoxConstraints(maxWidth: maxWidth), child: child),
      );
}

/// Horizontal page padding that grows with the screen (16 → 24 → 32).
EdgeInsets pagePadding(BuildContext context, {double top = 16, double bottom = 24}) {
  final w = MediaQuery.sizeOf(context).width;
  final h = w < 400 ? 16.0 : (w < 700 ? 20.0 : 28.0);
  return EdgeInsets.fromLTRB(h, top, h, bottom);
}

/// Grid whose column count follows the available width — no breakpoints to maintain.
class AdaptiveGrid extends StatelessWidget {
  final List<Widget> children;
  final double minTileWidth;
  final double tileHeight;
  const AdaptiveGrid({super.key, required this.children, this.minTileWidth = 150, this.tileHeight = 132});

  @override
  Widget build(BuildContext context) => GridView(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
          maxCrossAxisExtent: minTileWidth * 1.5,
          mainAxisExtent: tileHeight,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
        ),
        children: children,
      );
}

/// Use in MaterialApp.builder: respects the user's font size but stops layouts breaking at extremes.
Widget clampTextScale(BuildContext context, Widget? child) {
  final mq = MediaQuery.of(context);
  return MediaQuery(
    data: mq.copyWith(textScaler: mq.textScaler.clamp(minScaleFactor: 0.9, maxScaleFactor: 1.3)),
    child: child ?? const SizedBox.shrink(),
  );
}
