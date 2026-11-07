#!/bin/bash
set -e

echo "🚀 Applying Spandan IT Professionals branding to Web UI..."

# Ensure we're in frontend directory or locate it
if [ -d "frontend/src" ]; then
  cd frontend
fi

# 1. Update AppShell.tsx (Header subtext + Sidebar Persistent Branding Footer)
python3 - << 'PYEOF'
import re

appshell_path = "src/components/AppShell.tsx"
with open(appshell_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace any lingering Rakshak Security header mentions
content = content.replace("Powered By Rakshak Security", "Powered By Spandan IT Professionals")
content = content.replace("Powered by Rakshak Security Operations", "Powered by Spandan IT Professionals")

# Inject Spandan IT Professionals badge above the sidebar collapse button if not present
if "Spandan IT Professionals" not in content or "Platform by" not in content:
    # Match the collapse toggle button section
    collapse_pattern = r'(<button\s+[^>]*onClick=\{\(\)\s*=>\s*setCollapsed\(!collapsed\)\}[^>]*>)'
    replacement = r'''{/* Persistent Spandan IT Branding Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Platform By</span>
              <span className="text-xs font-black text-slate-800 truncate">Spandan IT Professionals</span>
            </div>
            <a
              href="https://spandanit.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:underline shrink-0"
            >
              Visit ↗
            </a>
          </div>
        </div>
        \1'''
    content = re.sub(collapse_pattern, replacement, content, count=1)

with open(appshell_path, "w", encoding="utf-8") as f:
    f.write(content)
print("✅ src/components/AppShell.tsx updated with sidebar branding footer.")
PYEOF

# 2. Update Login.tsx (Login Footer Branding)
python3 - << 'PYEOF'
login_path = "src/pages/Login.tsx"
with open(login_path, "r", encoding="utf-8") as f:
    content = f.read()

# Ensure Spandan IT footer exists at the bottom of the login card
if "Spandan IT Professionals" not in content:
    # Look for the closing container tag or bottom element of Login card
    footer_jsx = '''
        {/* Spandan IT System Infrastructure Branding */}
        <div className="mt-8 pt-4 border-t border-slate-100 text-center">
          <p className="text-xs font-semibold text-slate-500">
            Enterprise Security Infrastructure by <span className="text-slate-800 font-bold">Spandan IT Professionals</span>
          </p>
          <a
            href="https://spandanit.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-blue-600 hover:underline mt-1 inline-block"
          >
            www.spandanit.com
          </a>
        </div>
      </div>
    </div>
  );
};'''
    content = content.replace("</div>\n    </div>\n  );\n};", footer_jsx, 1)
    with open(login_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ src/pages/Login.tsx updated with login footer branding.")
else:
    print("ℹ️ src/pages/Login.tsx already contains Spandan IT Professionals branding.")
PYEOF

# 3. Test compile
echo "🔨 Verifying TypeScript build..."
npm run build

echo "✨ Web branding applied cleanly! Ready to commit and push."
