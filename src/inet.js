function inet_pton(a) {
  let m,
    f = String.fromCharCode;
  m = a.match(/^(?:\d{1,3}(?:\.|$)){4}/); // IPv4
  if (m) {
    m = m[0].split(".");
    m = f(m[0]) + f(m[1]) + f(m[2]) + f(m[3]);
    // Return if 4 bytes, otherwise false.
    return m.length === 4 ? m : false;
  }
  return false;
}

function inet_ntop(a) {
  if (a.length === 4) {
    a += "";
    return [
      a.charCodeAt(0),
      a.charCodeAt(1),
      a.charCodeAt(2),
      a.charCodeAt(3)
    ].join(".");
  }
  return false;
}

exports.inet_pton = inet_pton;
exports.inet_ntop = inet_ntop;
