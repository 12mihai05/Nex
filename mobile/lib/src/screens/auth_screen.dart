import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../state/app_controller.dart';
import '../widgets/preparation_screen.dart';
import '../widgets/nex_mark.dart';

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});
  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final email = TextEditingController(),
      password = TextEditingController(),
      name = TextEditingController(),
      invite = TextEditingController();
  var create = false;
  bool restoring = true;
  bool showPassword = false, showInvite = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final controller = ref.read(appControllerProvider.notifier);
      if (await controller.restoreSession() && mounted) {
        context.go(
          ref.read(appControllerProvider).onboardingComplete
              ? '/home'
              : '/onboarding',
        );
      }
      if (mounted) setState(() => restoring = false);
    });
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    name.dispose();
    invite.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(appControllerProvider);
    if (restoring) return const PreparationScreen(phase: 'Opening your Nex');
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: Theme.of(context).brightness == Brightness.dark
                    ? const [
                        Color(0xFF29131C),
                        NexColors.ink,
                        Color(0xFF111820),
                      ]
                    : const [
                        Color(0xFFF7E8ED),
                        NexColors.bone,
                        Color(0xFFF0ECE8),
                      ],
              ),
            ),
          ),
          Positioned(
            top: -70,
            right: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: NexColors.ember.withValues(alpha: .15),
              ),
            ),
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(26, 44, 26, 28),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 430),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          const NexMark(size: 46),
                          const SizedBox(width: 10),
                          Text(
                            'Nex',
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.onSurface,
                              fontSize: 34,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -1.5,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 28),
                      Text(
                        create ? 'Make Nex yours.' : 'Welcome back.',
                        style: Theme.of(context).textTheme.displaySmall
                            ?.copyWith(
                              color: Theme.of(context).colorScheme.onSurface,
                            ),
                      ),
                      const SizedBox(height: 28),
                      if (create) ...[
                        TextField(
                          controller: name,
                          textCapitalization: TextCapitalization.words,
                          decoration: const InputDecoration(labelText: 'Name'),
                        ),
                        const SizedBox(height: 12),
                      ],
                      TextField(
                        controller: email,
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                        decoration: const InputDecoration(labelText: 'Email'),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: password,
                        obscureText: !showPassword,
                        autocorrect: false,
                        enableSuggestions: false,
                        decoration: InputDecoration(
                          labelText: 'Password',
                          suffixIcon: IconButton(
                            tooltip: showPassword
                                ? 'Hide password'
                                : 'Show password',
                            onPressed: () =>
                                setState(() => showPassword = !showPassword),
                            icon: Icon(
                              showPassword
                                  ? Icons.visibility_off_outlined
                                  : Icons.visibility_outlined,
                            ),
                          ),
                        ),
                      ),
                      if (create) ...[
                        const SizedBox(height: 12),
                        TextField(
                          controller: invite,
                          obscureText: !showInvite,
                          autocorrect: false,
                          enableSuggestions: false,
                          decoration: InputDecoration(
                            labelText: 'Private invite code',
                            suffixIcon: IconButton(
                              tooltip: showInvite
                                  ? 'Hide invite code'
                                  : 'Show invite code',
                              onPressed: () =>
                                  setState(() => showInvite = !showInvite),
                              icon: Icon(
                                showInvite
                                    ? Icons.visibility_off_outlined
                                    : Icons.visibility_outlined,
                              ),
                            ),
                          ),
                        ),
                      ],
                      if (state.error != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(
                            state.error!,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ),
                      const SizedBox(height: 18),
                      FilledButton(
                        onPressed: state.busy
                            ? null
                            : () async {
                                final ok = await ref
                                    .read(appControllerProvider.notifier)
                                    .authenticate(
                                      create: create,
                                      name: name.text.trim(),
                                      email: email.text.trim(),
                                      password: password.text,
                                      invite: invite.text,
                                    );
                                if (ok && context.mounted) {
                                  context.go(
                                    ref
                                            .read(appControllerProvider)
                                            .onboardingComplete
                                        ? '/home'
                                        : '/onboarding',
                                  );
                                }
                              },
                        child: state.busy
                            ? const SizedBox.square(
                                dimension: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Text(
                                create ? 'Create private account' : 'Sign in',
                              ),
                      ),
                      TextButton(
                        onPressed: () => setState(() {
                          create = !create;
                          showPassword = false;
                          showInvite = false;
                        }),
                        child: Text(
                          create
                              ? 'Already have an account? Sign in'
                              : 'New here? Create an account',
                        ),
                      ),
                      Padding(
                        padding: EdgeInsets.symmetric(vertical: 10),
                        child: Row(
                          children: [
                            Expanded(child: Divider()),
                            Padding(
                              padding: EdgeInsets.symmetric(horizontal: 12),
                              child: Text(
                                'OR',
                                style: TextStyle(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurfaceVariant,
                                  fontSize: 11,
                                ),
                              ),
                            ),
                            Expanded(child: Divider()),
                          ],
                        ),
                      ),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Theme.of(context)
                              .colorScheme
                              .onSurface,
                        ),
                        onPressed: () {
                          ref.read(appControllerProvider.notifier).enterDemo();
                          context.go('/onboarding');
                        },
                        icon: const Icon(Icons.play_circle_outline),
                        label: const Text('Explore demo mode'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
