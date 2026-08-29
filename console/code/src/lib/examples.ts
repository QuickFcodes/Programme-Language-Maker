/**
 * Built-in example source files for the PLM HTML UI.
 */

export interface ExampleFile {
  name: string;
  description: string;
  content: string;
}

export const EXAMPLE_FILES: ExampleFile[] = [
  {
    name: 'fibonacci.ml',
    description: 'Recursive Fibonacci — demonstrates functions and recursion',
    content: `// MiniLang — recursive Fibonacci
fn fib(n) {
  if (n < 2) {
    return n;
  }
  return fib(n - 1) + fib(n - 2);
}

let i = 0;
while (i < 15) {
  print fib(i);
  i = i + 1;
}
`,
  },
  {
    name: 'arithmetic.ml',
    description: 'Arithmetic expressions with precedence',
    content: `// Arithmetic with operator precedence
print 1 + 2 * 3;       // 7
print (1 + 2) * 3;     // 9
print 10 - 3 - 2;      // 5  (left-associative)
print 20 / 4;          // 5
print 20 % 3;          // 2
print -5 + 10;         // 5
print 2 * 3 + 4 * 5;   // 26
`,
  },
  {
    name: 'logic.ml',
    description: 'Boolean logic and comparisons',
    content: `// Boolean logic
print true;
print false;
print !true;
print !false;
print true && false;
print true || false;
print 3 < 5;
print 5 >= 5;
print 5 == 5;
print 5 != 5;
print (3 < 5) && (5 > 1);
print (1 > 2) || (3 < 5);
`,
  },
  {
    name: 'strings.ml',
    description: 'String literals and concatenation',
    content: `// Strings
print "hello, world";
print "abc" + "def";
let greeting = "Hello, ";
let name = "PLM";
print greeting + name + "!";
print "Line 1\\nLine 2";
print "Tab:\\tEnd";
`,
  },
  {
    name: 'functions.ml',
    description: 'Multiple functions with parameters',
    content: `// Functions with multiple parameters
fn add(a, b) {
  return a + b;
}

fn multiply(a, b) {
  return a * b;
}

fn power(base, exp) {
  let result = 1;
  let i = 0;
  while (i < exp) {
    result = result * base;
    i = i + 1;
  }
  return result;
}

print add(3, 4);
print multiply(5, 6);
print power(2, 10);
print power(3, 3);
`,
  },
  {
    name: 'countdown.ml',
    description: 'A simple countdown program',
    content: `// Countdown from 10
print "Starting countdown...";
let n = 10;
while (n > 0) {
  print n;
  n = n - 1;
}
print "Lift off!";
`,
  },
];
