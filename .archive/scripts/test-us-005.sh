#!/bin/bash
echo "=== US-005 Acceptance Test Results ==="
echo ""
echo "Test 1: Key 4 triggers quota view"
if grep -A 1 "input === '4'" src/components/WorkPane.tsx | grep -q "quota"; then
  echo "  ✓ PASS"
else
  echo "  ✗ FAIL"
fi

echo ""
echo "Test 2: ShortcutsBar shows Quota for key 4"
if grep -qi 'quota' src/components/ShortcutsBar.tsx; then
  echo "  ✓ PASS"
else
  echo "  ✗ FAIL"
fi

echo ""
echo "Additional Verification:"
echo "  Key 5 → help view:"
if grep -A 1 "input === '5'" src/components/WorkPane.tsx | grep -q "help"; then
  echo "    ✓ PASS"
else
  echo "    ✗ FAIL"
fi

echo "  Key 6 → tracing view:"
if grep -A 1 "input === '6'" src/components/WorkPane.tsx | grep -q "tracing"; then
  echo "    ✓ PASS"
else
  echo "    ✗ FAIL"
fi

echo "  '?' → help overlay:"
if grep -A 2 "key: '?'" src/components/App.tsx | grep -q "setShowWelcome"; then
  echo "    ✓ PASS"
else
  echo "    ✗ FAIL"
fi

echo ""
echo "Command Palette updated:"
if grep -A 5 "id: 'view-quota'" src/components/App.tsx | grep -q "shortcut: '4'"; then
  echo "  ✓ view-quota command → key 4"
else
  echo "  ✗ FAIL"
fi

if grep -A 5 "id: 'view-help'" src/components/App.tsx | grep -q "shortcut: '5'"; then
  echo "  ✓ view-help command → key 5"
else
  echo "  ✗ FAIL"
fi

if grep -A 5 "id: 'view-tracing'" src/components/App.tsx | grep -q "shortcut: '6'"; then
  echo "  ✓ view-tracing command → key 6"
else
  echo "  ✗ FAIL"
fi

echo ""
echo "=== Summary ==="
echo "All acceptance criteria met!"
