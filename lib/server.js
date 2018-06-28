const net = require("net");
const fs = require("fs");
const udpRelay = require("./udprelay");
const utils = require("./utils");
const inet = require("./inet");
const { Encryptor } = require("./encrypt");

const timeout = 600000;
const METHOD = "aes-256-cfb";

exports.main = function() {
  let e;
  console.log(utils.version);

  let config = utils.loadConfig(true);

  const PORT = config.server_port;
  const KEY = config.password;
  const server_ip = config.server;

  const server = net.createServer(function(connection) {
    let encryptor = new Encryptor(KEY, METHOD);
    let stage = 0;
    let headerLength = 0;
    let remote = null;
    let cachedPieces = [];
    let addrLen = 0;
    let remoteAddr = null;
    let remotePort = null;

    const clean = () => {
      remote = null;
      connection = null;
      encryptor = null;
    };

    connection.on("data", function(data) {
      try {
        data = encryptor.decrypt(data);
      } catch (e) {
        utils.error(e);
        if (remote) {
          remote.destroy();
        }
        if (connection) {
          connection.destroy();
        }
        return;
      }

      if (stage === 4) {
        if (!remote.write(data)) {
          connection.pause();
        }
        return;
      }
      if (stage === 0) {
        try {
          const atyp = data[0];
          if (atyp === 3) {
            addrLen = data[1];
          } else if (![1, 4].includes(atyp)) {
            connection.destroy();
            return;
          }

          if (atyp === 1) {
            remoteAddr = utils.inetNtoa(data.slice(1, 5));
            remotePort = data.readUInt16BE(5);
            headerLength = 7;
          } else if (atyp === 4) {
            remoteAddr = inet.inet_ntop(data.slice(1, 17));
            remotePort = data.readUInt16BE(17);
            headerLength = 19;
          } else {
            remoteAddr = data.slice(2, 2 + addrLen).toString("binary");
            remotePort = data.readUInt16BE(2 + addrLen);
            headerLength = 2 + addrLen + 2;
          }

          connection.pause();

          remote = net.connect(
            remotePort,
            remoteAddr,
            function() {
              if (!encryptor || !remote || !connection) {
                if (remote) {
                  remote.destroy();
                }
                return;
              }
              let i = 0;

              connection.resume();

              while (i < cachedPieces.length) {
                const piece = cachedPieces[i];
                remote.write(piece);
                i++;
              }
              cachedPieces = null;

              stage = 4;
            }
          );

          remote.on("data", function(data) {
            if (!encryptor) {
              if (remote) {
                remote.destroy();
              }
              return;
            }
            data = encryptor.encrypt(data);
            if (!connection.write(data)) {
              return remote.pause();
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

          remote.setTimeout(5000, function() {
            if (remote) {
              remote.destroy();
            }
            if (connection) {
              return connection.destroy();
            }
          });

          if (data.length > headerLength) {
            let buf = Buffer.allocUnsafe(data.length - headerLength);
            data.copy(buf, 0, headerLength);
            cachedPieces.push(buf);
            buf = null;
          }
          stage = 3;
          return;
        } catch (e) {
          utils.error(e);
          connection.destroy();
          if (remote) {
            return remote.destroy();
          }
          clean();
        }
      } else if (stage === 3) {
        return cachedPieces.push(data);
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
      if (remote) {
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

  server.listen(PORT, server_ip, () =>
    utils.info(`server listening at ${server_ip}:${PORT} `)
  );

  udpRelay.createServer(
    server_ip,
    PORT,
    null,
    null,
    KEY,
    METHOD,
    timeout,
    false
  );

  server.on("error", function(e) {
    utils.error(e);
    return process.stdout.on("drain", () => process.exit(1));
  });

  utils.intervalInfo(() => {
    server.getConnections((e, cnt) => {
      if (e) utils.error(e);
      utils.info(`concurrent connections: ${cnt}`);
    });
  });
};
