const child_process = require("child_process");
const local = child_process.spawn("bin/ssllocal", []);
const server = child_process.spawn("bin/sslserver", []);

local.on("exit", function(code) {
  server.kill();
  if (!curlRunning) {
    return process.exit(code);
  }
});

server.on("exit", function(code) {
  local.kill();
  if (!curlRunning) {
    return process.exit(code);
  }
});

let localReady = false;
let serverReady = false;
let curlRunning = false;

const runCurl = function() {
  curlRunning = true;
  const curl = child_process.spawn("curl", [
    "-v",
    "http://www.example.com/",
    "-L",
    "--socks5-hostname",
    "127.0.0.1:1080"
  ]);
  curl.on("exit", function(code) {
    if (code === 0) {
      console.log("Test passed");
      return process.exit(0);
    } else {
      console.error("Test failed");
      return process.exit(code);
    }
  });

  curl.stdout.on("data", data => process.stdout.write(data));

  return curl.stderr.on("data", data => process.stderr.write(data));
};

local.stderr.on("data", data => process.stderr.write(data));

server.stderr.on("data", data => process.stderr.write(data));

local.stdout.on("data", function(data) {
  process.stdout.write(data);
  if (data.toString().indexOf("listening at") >= 0) {
    localReady = true;
    if (localReady && serverReady && !curlRunning) {
      return runCurl();
    }
  }
});

server.stdout.on("data", function(data) {
  process.stdout.write(data);
  if (data.toString().indexOf("listening at") >= 0) {
    serverReady = true;
    if (localReady && serverReady && !curlRunning) {
      return runCurl();
    }
  }
});

process.on("exit", code => {
  server.kill();
  local.kill();
});
