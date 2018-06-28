const { spawn } = require("child_process");
const utils = require("./utils");
const defaultScore = 100000;

let rawIps;
let selected;
const ipsScore = {};

const updateRes = function() {
  for (let ip in ipsScore) {
    if (ipsScore[ip] < (ipsScore[selected] || Number.MAX_SAFE_INTEGER)) {
      selected = ip;
    }
  }
};

const refreshScore = function() {
  for (let ip in ipsScore) {
    ipsScore[ip] = defaultScore;
  }
};

const getPing = function(ips) {
  rawIps = ips = Array.isArray(ips) ? ips : [ips];
  for (let ip of ips) {
    const ping = spawn("ping", [ip, "-i", 2]);

    ping.stdout.on("data", data => {
      try {
        data = data.toString();
        time = data.split(" ")[6].split("=")[1];

        ipsScore[ip] = parseInt(
          (ipsScore[ip] || defaultScore) * 0.8 + time * 0.2
        );
      } catch (e) {
        utils.error(e);
      }
    });
    ping.stderr.on("data", data => {
      console.log(`ping stderr: ${data}`);
    });

    ping.on("close", code => {
      if (ipsScore[ip]) {
        delete ipsScore[ip];
      }
      if (code !== 0) {
        utils.error(`ping process exited with code ${code}`);
      }
    });
  }

  setInterval(updateRes, 5000);
  setInterval(refreshScore, 30000);
};

const getServer = () => {
  return selected || rawIps[0];
};

exports.getServer = getServer;
exports.getPing = getPing;
