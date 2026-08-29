// Functions with multiple parameters
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
