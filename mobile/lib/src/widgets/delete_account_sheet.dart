import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../state/app_controller.dart';

class DeleteAccountSheet extends StatefulWidget {
  const DeleteAccountSheet({
    super.key,
    required this.controller,
    required this.demo,
  });
  final AppController controller;
  final bool demo;
  @override
  State<DeleteAccountSheet> createState() => _DeleteAccountSheetState();
}

class _DeleteAccountSheetState extends State<DeleteAccountSheet> {
  final password = TextEditingController();
  bool visible = false, busy = false;
  String? error;
  @override
  void dispose() {
    password.dispose();
    super.dispose();
  }

  Future<void> remove() async {
    if (busy || (!widget.demo && password.text.isEmpty)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.controller.deleteAccount(
        password: widget.demo ? null : password.text,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      if (!widget.controller.isAuthenticated) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Your account was deleted. Device reminder cleanup failed; clear Nex app storage to remove any remaining local notifications.',
            ),
          ),
        );
        Navigator.pop(context, true);
      } else {
        setState(() {
          busy = false;
          error = readableApiError(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Delete your account?',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 12),
            const Text(
              'This permanently removes your Nex profile, taste, lists, history, chats and reminders. This cannot be undone.',
            ),
            if (!widget.demo) ...[
              const SizedBox(height: 20),
              TextField(
                controller: password,
                enabled: !busy,
                obscureText: !visible,
                autocorrect: false,
                enableSuggestions: false,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: 'Current password',
                  suffixIcon: IconButton(
                    tooltip: visible ? 'Hide password' : 'Show password',
                    onPressed: busy
                        ? null
                        : () => setState(() => visible = !visible),
                    icon: Icon(
                      visible
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                    ),
                  ),
                ),
              ),
            ],
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: busy || (!widget.demo && password.text.isEmpty)
                  ? null
                  : remove,
              child: Text(
                busy ? 'Deleting your data…' : 'Permanently delete account',
              ),
            ),
            TextButton(
              onPressed: busy ? null : () => Navigator.pop(context, false),
              child: const Text('Keep my account'),
            ),
          ],
        ),
      ),
    ),
  );
}
