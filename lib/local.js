const net = require("net");
const fs = require("fs");
const udpRelay = require("./udprelay");
const utils = require("./utils");
const inet = require("./inet");
const { Encryptor } = require("./encrypt");
const { getServer, getPing } = require("./ips");

const timeout = 600000;
const method = "aes-256-cfb";

let inBytesCnt = 0;
const addBytes = function(n) {
  inBytesCnt += n;
};

exports.main = function() {
  console.log(utils.version);

  const config = utils.loadConfig();

  const serverAddr = config.server;
  const serverPort = config.server_port;
  const port = config.local_port;
  const key = config.password;
  const local_address = config.local_address;

  getPing(serverAddr);

  const udpServer = udpRelay.createServer(
    local_address,
    port,
    serverAddr,
    serverPort,
    key,
    method,
    timeout,
    true
  );

  const server = net.createServer(function(connection) {
    let encryptor = new Encryptor(key, method);
    let stage = 0;
    let headerLength = 0;
    let remote = null;
    let addrLen = 0;
    let remoteAddr = null;
    let remotePort = null;
    let addrToSend = "";

    const clean = () => {
      remote = null;
      connection = null;
      encryptor = null;
    };

    connection.on("data", function(data) {
      if (stage === 4) {
        data = encryptor.encrypt(data);
        if (!remote.write(data)) {
          connection.pause();
        }
        return;
      }

      if (stage === 0) {
        connection.write("0500", "hex");
        stage = 1;
        return;
      }
      if (stage === 1) {
        try {
          let reply;
          const cmd = data[1];
          const atyp = data[3];
          if (cmd === 1) {
          } else if (cmd === 3) {
            reply = Buffer.allocUnsafe(10);
            reply.write("\u0005\u0000\u0000\u0001", 0, 4, "binary");
            utils.inetAton(connection.localAddress).copy(reply, 4);
            reply.writeUInt16BE(connection.localPort, 8);
            connection.write(reply);
            stage = 10;
            return;
          } else {
            connection.end("05070001", "hex");
            utils.error(`cmd ${cmd} not support`);
            return;
          }
          if (atyp === 3) {
            addrLen = data[4];
          } else if (![1, 4].includes(atyp)) {
            connection.destroy();
            return;
          }

          addrToSend = data.slice(3, 4).toString("binary");
          if (atyp === 1) {
            remoteAddr = utils.inetNtoa(data.slice(4, 8));
            addrToSend += data.slice(4, 10).toString("binary");
            remotePort = data.readUInt16BE(8);
            headerLength = 10;
          } else if (atyp === 4) {
            remoteAddr = inet.inet_ntop(data.slice(4, 20));
            addrToSend += data.slice(4, 22).toString("binary");
            remotePort = data.readUInt16BE(20);
            headerLength = 22;
          } else {
            remoteAddr = data.slice(5, 5 + addrLen).toString("binary");
            addrToSend += data.slice(4, 5 + addrLen + 2).toString("binary");
            remotePort = data.readUInt16BE(5 + addrLen);
            headerLength = 5 + addrLen + 2;
          }

          connection.write("05000001000000000001", "hex");

          remote = net.createConnection(
            serverPort,
            getServer(),
            () => (stage = 4)
          );

          remote.setNoDelay(true);

          remote.on("data", function(data) {
            try {
              if (encryptor) {
                data = encryptor.decrypt(data);
                addBytes(data.length);
                if (!connection.write(data)) {
                  return remote.pause();
                }
              } else if (remote) {
                return remote.destroy();
              }
            } catch (e) {
              utils.error(e);
              if (remote) {
                remote.destroy();
              }
              if (connection) {
                return connection.destroy();
              }
            }
          });

          remote.on("end", function() {
            if (connection) {
              return connection.end();
            }
          });

          remote.on("error", function(e) {
            return utils.error(
              `remote ${remoteAddr}:${remotePort} error: ${e}`
            );
          });

          remote.on("close", function(had_error) {
            if (had_error) {
              if (connection) {
                return connection.destroy();
              }
            } else {
              if (connection) {
                return connection.end();
              }
            }
          });

          remote.on("drain", function() {
            if (connection) {
              return connection.resume();
            }
          });

          remote.setTimeout(timeout, function() {
            if (remote) {
              remote.destroy();
            }
            if (connection) {
              return connection.destroy();
            }
          });

          addrToSend = Buffer.from(addrToSend, "binary");
          addrToSend = encryptor.encrypt(addrToSend);
          remote.write(addrToSend);

          if (data.length > headerLength) {
            buf = Buffer.allocUnsafe(data.length - headerLength);
            data.copy(buf, 0, headerLength);
            const piece = encryptor.encrypt(buf);
            remote.write(piece);
          }
          stage = 3;
          return;
        } catch (e) {
          utils.error(e);
          if (connection) {
            connection.destroy();
          }
          if (remote) {
            remote.destroy();
          }
          return clean();
        }
      } else if (stage === 3) {
        if (remote === null) {
          if (connection) {
            connection.destroy();
          }
          return;
        }
        data = encryptor.encrypt(data);
        if (!remote.write(data)) {
          return connection.pause();
        }
      }
    });

    connection.on("end", function() {
      if (remote) {
        return remote.end();
      }
    });

    connection.on("error", function(e) {
      return utils.error(`local error: ${e}`);
    });

    connection.on("close", function(had_error) {
      if (had_error) {
        if (remote) {
          remote.destroy();
        }
      } else {
        if (remote) {
          remote.end();
        }
      }
      return clean();
    });

    connection.on("drain", function() {
      if (remote && stage === 4) {
        return remote.resume();
      }
    });

    return connection.setTimeout(timeout, function() {
      if (remote) {
        remote.destroy();
      }
      if (connection) {
        return connection.destroy();
      }
    });
  });

  server.listen(port, local_address, () =>
    utils.info(`local listening at ${server.address().address}:${port}`)
  );

  server.on("error", function(e) {
    return utils.error(e);
  });

  server.on("close", () => udpServer.close());

  server.on("error", e => process.stdout.on("drain", () => process.exit(1)));

  utils.intervalInfo(() => {
    utils.info(`--> ${(inBytesCnt / (5 * 1024)).toFixed(2)} KB/s`);
    inBytesCnt = 0;
  });
};
