import 'package:flutter/material.dart';

/// Crisp, background-free rendering of the approved Nex cinema-splice mark.
class NexMark extends StatelessWidget {
  const NexMark({super.key, this.size = 40});
  final double size;
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: SizedBox.square(
      dimension: size,
      child: CustomPaint(
        painter: _NexMarkPainter(
          Theme.of(context).brightness == Brightness.dark,
        ),
      ),
    ),
  );
}

class _NexMarkPainter extends CustomPainter {
  const _NexMarkPainter(this.dark);
  final bool dark;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    final scale = size.shortestSide / 800;
    canvas.translate(
      (size.width - 640 * scale) / 2,
      (size.height - 760 * scale) / 2,
    );
    canvas.scale(scale);
    final face = Paint()
      ..color = dark ? const Color(0xFFFFF2DD) : const Color(0xFF681C32);
    final edge = Paint()..color = const Color(0xFFD34A60);
    final cut = Paint()
      ..color = dark ? const Color(0xFF681C32) : const Color(0xFFA82544);
    canvas.drawPath(
      Path()
        ..moveTo(8, 32)
        ..lineTo(207, 347)
        ..lineTo(207, 724)
        ..lineTo(60, 724)
        ..quadraticBezierTo(8, 724, 8, 672)
        ..close(),
      face,
    );
    canvas.drawPath(
      Path()
        ..moveTo(0, 0)
        ..lineTo(330, 170)
        ..quadraticBezierTo(392, 200, 392, 255)
        ..lineTo(392, 398)
        ..close(),
      face,
    );
    canvas.drawPath(
      Path()
        ..moveTo(435, 36)
        ..lineTo(582, 36)
        ..quadraticBezierTo(638, 36, 638, 92)
        ..lineTo(638, 725)
        ..lineTo(435, 432)
        ..close(),
      face,
    );
    canvas.drawPath(
      Path()
        ..moveTo(247, 412)
        ..lineTo(638, 758)
        ..lineTo(310, 613)
        ..quadraticBezierTo(247, 585, 247, 528)
        ..close(),
      face,
    );
    canvas.drawPath(
      Path()
        ..moveTo(0, 0)
        ..lineTo(438, 440)
        ..lineTo(638, 758)
        ..lineTo(247, 417)
        ..lineTo(8, 32)
        ..close(),
      edge,
    );
    canvas.drawPath(
      Path()
        ..moveTo(15, 28)
        ..lineTo(429, 448)
        ..lineTo(623, 736)
        ..lineTo(257, 407)
        ..close(),
      cut,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _NexMarkPainter oldDelegate) =>
      dark != oldDelegate.dark;
}
