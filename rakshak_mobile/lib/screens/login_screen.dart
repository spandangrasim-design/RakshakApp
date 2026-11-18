import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';
import '../widgets/responsive.dart';
import '../widgets/ui_kit.dart';
import 'dashboard_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _auth = AuthService();

  bool _loading = false;
  bool _hide = true;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_code.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter your employee code and password.');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final result = await _auth.login(_code.text.trim(), _password.text);
    if (!mounted) return;
    setState(() => _loading = false);

    if (result['success']) {
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const DashboardScreen()));
    } else {
      setState(() => _error = result['message']?.toString() ?? 'Login failed');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, c) => SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: pagePadding(context, top: 24, bottom: 24),
            // minHeight lets the form centre on tall screens but scroll when the keyboard is open.
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: c.maxHeight - 48),
              child: ResponsiveBody(
                maxWidth: 440,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: Container(
                        width: 76, height: 76,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [AppColors.brand, AppColors.brandDark],
                            begin: Alignment.topLeft, end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(24),
                          boxShadow: [BoxShadow(color: AppColors.brand.withAlpha(70), blurRadius: 24, offset: const Offset(0, 10))],
                        ),
                        child: const Icon(Icons.shield_outlined, size: 40, color: Colors.white),
                      ),
                    ),
                    const SizedBox(height: 20),
                    const Text('Rakshak', textAlign: TextAlign.center, style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
                    const SizedBox(height: 4),
                    const Text('Sign in to start your shift', textAlign: TextAlign.center, style: TextStyle(color: AppColors.inkSoft, fontSize: 15)),
                    const SizedBox(height: 32),
                    if (_error != null) ...[ErrorBox(_error!), const SizedBox(height: 16)],
                    TextField(
                      controller: _code,
                      textInputAction: TextInputAction.next,
                      autocorrect: false,
                      textCapitalization: TextCapitalization.characters,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(labelText: 'Employee code', hintText: 'e.g. G-101', prefixIcon: Icon(Icons.badge_outlined)),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _password,
                      obscureText: _hide,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _loading ? null : _login(),
                      autofillHints: const [AutofillHints.password],
                      decoration: InputDecoration(
                        labelText: 'Password',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          tooltip: _hide ? 'Show password' : 'Hide password',
                          icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                          onPressed: () => setState(() => _hide = !_hide),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _loading ? null : _login,
                      child: _loading
                          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                          : const Text('Sign in'),
                    ),
                    const SizedBox(height: 28),
                    const Text('Powered by Spandan IT Professionals', textAlign: TextAlign.center, style: TextStyle(color: AppColors.inkMute, fontSize: 12)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
