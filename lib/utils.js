const util = require("util");
const path = require("path");
const fs = require("fs");
const pack = require("../package.json");

const U = exports;

U.version = `${pack.name} v${pack.version}`;

const printHelp = isServer =>
  console.log(
    `\
usage: %s [-h] [-c config]

optional arguments:
  -h, --help            show this help message and exit
  -c CONFIG             path to config file\
`,
    isServer ? "sslserver" : "ssllocal"
  );

U.parseArgs = function(isServer) {
  const defination = {
    "-c": "config_file"
  };

  const result = {};
  let nextIsValue = false;
  let lastKey = null;
  for (let _ in process.argv) {
    const oneArg = process.argv[_];
    if (nextIsValue) {
      result[lastKey] = oneArg;
      nextIsValue = false;
    } else if (oneArg in defination) {
      lastKey = defination[oneArg];
      nextIsValue = true;
    } else if ("-v" === oneArg) {
      result["verbose"] = true;
    } else if (oneArg.indexOf("-") === 0) {
      printHelp(isServer);
      process.exit(2);
    }
  }
  return result;
};

U.loadConfig = function(isServer = false) {
  const configFromArgs = U.parseArgs(isServer);

  let configPath = "config.json";
  if (configFromArgs.config_file) {
    configPath = configFromArgs.config_file;
  }
  if (!fs.existsSync(configPath)) {
    configPath = path.resolve(__dirname, "config.json");
    if (!fs.existsSync(configPath)) {
      configPath = path.resolve("/etc/shadowsocks-lite/config.json");
      if (!fs.existsSync(configPath)) {
        configPath = null;
      }
    }
  }

  if (configPath) {
    U.info(`loading config from ${configPath}`);
    const configContent = fs.readFileSync(configPath);
    try {
      config = JSON.parse(configContent);
    } catch (error) {
      e = error;
      U.error(`found an error in config.json: ${e.message}`);
      process.exit(1);
    }
  } else {
    config = {};
  }
  for (let k in configFromArgs) {
    const v = configFromArgs[k];
    config[k] = v;
  }

  if (
    !(
      config.server &&
      config.server_port &&
      config.password &&
      config.local_address &&
      config.local_port
    )
  ) {
    U.error(
      "config.json not found, you have to specify all config in config.json"
    );
    process.exit(1);
  }

  return config;
};

U.inetNtoa = buf => buf[0] + "." + buf[1] + "." + buf[2] + "." + buf[3];

U.inetAton = function(ipStr) {
  const parts = ipStr.split(".");
  if (parts.length !== 4) {
    return null;
  } else {
    const buf = Buffer.allocUnsafe(4);
    let i = 0;
    while (i < 4) {
      buf[i] = +parts[i];
      i++;
    }
    return buf;
  }
};

U.INFO = 1;
U.ERROR = 2;

let _logging_level = U.INFO;

U.log = function(level, msg) {
  return process.stdout.write(msg + "\n");
};

U.info = msg => U.log(U.INFO, msg);

U.error = msg => U.log(U.ERROR, (msg != null ? msg.stack : undefined) || msg);

U.intervalInfo = function() {
  Array.from(arguments).map(f => {
    setInterval(f, 5000);
  });
};
