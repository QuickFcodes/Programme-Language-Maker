// MiniLang — using std.math functions
// abs, min, max are available via default imports
print abs(-42);
print min(3, 7);
print max(3, 7);

// Recursive Fibonacci
fn fib(n) {
  if (n < 2) {
    return n;
  }
  return fib(n - 1) + fib(n - 2);
}

let i = 0;
while (i < 10) {
  print fib(i);
  i = i + 1;
}
