import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import '../state/app_controller.dart';

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
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF241713), NexColors.ink, Color(0xFF111820)],
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
                      const Text(
                        'Nex',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 34,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -1.5,
                        ),
                      ),
                      const SizedBox(height: 58),
                      Text(
                        'Your next great watch,\nwithout the hunt.',
                        style: Theme.of(context).textTheme.displayLarge
                            ?.copyWith(color: Colors.white),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        'Streaming, Romanian TV and recommendations that understand what you mean.',
                        style: Theme.of(context).textTheme.bodyLarge
                            ?.copyWith(color: Colors.white70),
                      ),
                      const SizedBox(height: 38),
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
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Password',
                        ),
                      ),
                      if (create) ...[
                        const SizedBox(height: 12),
                        TextField(
                          controller: invite,
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText: 'Private invite code',
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
                        onPressed: () => setState(() => create = !create),
                        child: Text(
                          create
                              ? 'Already have an account? Sign in'
                              : 'New here? Create an account',
                        ),
                      ),
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 10),
                        child: Row(
                          children: [
                            Expanded(child: Divider()),
                            Padding(
                              padding: EdgeInsets.symmetric(horizontal: 12),
                              child: Text(
                                'OR',
                                style: TextStyle(
                                  color: Colors.white54,
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
                          foregroundColor: Colors.white,
                        ),
                        onPressed: () {
                          ref.read(appControllerProvider.notifier).enterDemo();
                          context.go('/onboarding');
                        },
                        icon: const Icon(Icons.play_circle_outline),
                        label: const Text('Explore demo mode'),
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'Demo mode keeps all data on this device and never uses paid services.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white54, fontSize: 12),
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
