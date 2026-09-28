import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../models/tv_program.dart';

class ReminderSheet extends StatefulWidget {
  const ReminderSheet({super.key, required this.program, this.saved = false});
  final TvProgram program;
  final bool saved;
  @override
  State<ReminderSheet> createState() => _ReminderSheetState();
}

class _ReminderSheetState extends State<ReminderSheet> {
  final minutes = TextEditingController(text: '5');
  String? error;
  @override
  void dispose() {
    minutes.dispose();
    super.dispose();
  }

  int? get offset => int.tryParse(minutes.text);
  DateTime? get notificationTime => offset == null
      ? null
      : widget.program.startsAt.subtract(Duration(minutes: offset!));
  void submit() {
    final value = offset;
    if (value == null || value < 0 || value > 1440) {
      setState(() => error = 'Enter whole minutes from 0 to 1440.');
    } else if (!notificationTime!.isAfter(DateTime.now())) {
      setState(() => error = 'That time has passed. Choose fewer minutes.');
    } else {
      Navigator.pop(context, value);
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        24,
        8,
        24,
        24 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Remind me', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(
            widget.program.title,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          Text(
            '${widget.program.channel} · ${DateFormat.MMMd().add_Hm().format(widget.program.startsAt)}',
          ),
          const SizedBox(height: 24),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final value in [0, 5, 10, 30])
                ChoiceChip(
                  label: Text(value == 0 ? 'At start' : '${value}m'),
                  selected: offset == value,
                  onSelected: (_) => setState(() {
                    minutes.text = '$value';
                    error = null;
                  }),
                ),
            ],
          ),
          const SizedBox(height: 18),
          TextField(
            controller: minutes,
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(4),
            ],
            decoration: InputDecoration(
              labelText: 'Minutes before',
              suffixText: 'min',
              helperText: 'Choose any whole number · up to 24 hours',
              helperMaxLines: 2,
              errorMaxLines: 3,
              errorText: error,
            ),
            onChanged: (_) => setState(() => error = null),
            onSubmitted: (_) => submit(),
          ),
          const SizedBox(height: 20),
          if (notificationTime case final DateTime time)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  const Icon(Icons.notifications_outlined),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Notify me ${DateFormat.MMMd().add_Hm().format(time)}',
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: submit,
            child: Text(widget.saved ? 'Update reminder' : 'Set reminder'),
          ),
          if (widget.saved)
            TextButton(
              onPressed: () => Navigator.pop(context, -1),
              child: const Text('Cancel reminder'),
            ),
        ],
      ),
    ),
  );
}
