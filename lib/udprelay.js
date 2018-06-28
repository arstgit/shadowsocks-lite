const utils = require("./utils");
const inet = require("./inet");
const encryptor = require("./encrypt");
const { getServer } = require("./ips");

const dgram = require("dgram");
const net = require("net");

class LRUCache {
  constructor(timeout, sweepInterval) {
    this.timeout = timeout;
    const that = this;
    const sweepFun = () => that.sweep();

    this.interval = setInterval(sweepFun, sweepInterval);
    this.dict = {};
  }

  setItem(key, value) {
    const cur = process.hrtime();
    return (this.dict[key] = [value, cur]);
  }

  getItem(key) {
    const v = this.dict[key];
    if (v) {
      v[1] = process.hrtime();
      return v[0];
    }
    return null;
  }

  delItem(key) {
    return delete this.dict[key];
  }

  destroy() {
    return clearInterval(this.interval);
  }

  sweep() {
    const { dict } = this;
    let swept = 0;
    for (let k of Object.keys(dict)) {
      const v = dict[k];
      const diff = process.hrtime(v[1]);
      if (diff[0] > this.timeout * 0.001) {
        swept++;
        const v0 = v[0];
        v0.close();
        delete dict[k];
      }
    }
    return utils.info(`${swept} keys swept`);
  }
}

const parseHeader = function(data, offset) {
  try {
    let addrLen, destAddr, destPort, headerLength;

    const addrtype = data[offset];
    if (addrtype === 3) {
      addrLen = data[offset + 1];
    } else if (![1, 4].includes(addrtype)) {
      return null;
    }

    if (addrtype === 1) {
      destAddr = utils.inetNtoa(data.slice(offset + 1, offset + 5));
      destPort = data.readUInt16BE(offset + 5);
      headerLength = offset + 7;
    } else if (addrtype === 4) {
      destAddr = inet.inet_ntop(data.slice(offset + 1, offset + 17));
      destPort = data.readUInt16BE(offset + 17);
      headerLength = offset + 19;
    } else {
      destAddr = data
        .slice(offset + 2, offset + 2 + addrLen)
        .toString("binary");
      destPort = data.readUInt16BE(offset + 2 + addrLen);
      headerLength = offset + 2 + addrLen + 2;
    }

    return [addrtype, destAddr, destPort, headerLength];
  } catch (e) {
    utils.error(e);
    return null;
  }
};

const encrypt = function(password, method, data) {
  try {
    return encryptor.encryptAll(password, method, 1, data);
  } catch (e) {
    utils.error(e);
    return null;
  }
};

const decrypt = function(password, method, data) {
  try {
    return encryptor.encryptAll(password, method, 0, data);
  } catch (e) {
    utils.error(e);
    return null;
  }
};

exports.createServer = function(
  listenAddr,
  listenPort,
  remoteAddr,
  remotePort,
  password,
  method,
  timeout,
  isLocal
) {
  let server = dgram.createSocket("udp4");
  let clients = new LRUCache(timeout, 10000);

  let clientKey = (localAddr, localPort, destAddr, destPort) =>
    `${localAddr}:${localPort}:${destAddr}:${destPort}`;

  server.on("message", function(data, rinfo) {
    let sendDataOffset, serverAddr, serverPort;
    let requestHeaderOffset = 0;
    if (isLocal) {
      if (data[2] !== 0) {
        return;
      }
      requestHeaderOffset = 3;
    } else {
      data = decrypt(password, method, data);
      if (data === null) {
        return;
      }
    }
    let headerResult = parseHeader(data, requestHeaderOffset);
    if (headerResult === null) {
      return;
    }

    let [addrtype, destAddr, destPort, headerLength] = headerResult;

    if (isLocal) {
      sendDataOffset = requestHeaderOffset;
      [serverAddr, serverPort] = [getServer(), remotePort];
    } else {
      sendDataOffset = headerLength;
      [serverAddr, serverPort] = [destAddr, destPort];
    }

    const key = clientKey(rinfo.address, rinfo.port, destAddr, destPort);
    let client = clients.getItem(key);
    if (client == null) {
      client = dgram.createSocket("udp4");
      clients.setItem(key, client);

      client.on("message", function(data1, rinfo1) {
        let data2, responseHeader;
        if (!isLocal) {
          const serverIPBuf = utils.inetAton(rinfo1.address);
          responseHeader = Buffer.allocUnsafe(7);
          responseHeader.write("\x01", 0);
          serverIPBuf.copy(responseHeader, 1, 0, 4);
          responseHeader.writeUInt16BE(rinfo1.port, 5);
          data2 = Buffer.concat([responseHeader, data1]);
          data2 = encrypt(password, method, data2);
          if (data2 == null) {
            return;
          }
        } else {
          responseHeader = Buffer.from("000000", "hex");
          data1 = decrypt(password, method, data1);
          if (data1 == null) {
            return;
          }
          headerResult = parseHeader(data1, 0);
          if (headerResult === null) {
            return;
          }

          [addrtype, destAddr, destPort, headerLength] = headerResult;
          data2 = Buffer.concat([responseHeader, data1]);
        }
        return server.send(
          data2,
          0,
          data2.length,
          rinfo.port,
          rinfo.address,
          (e, bytes) => {
            if (e) utils.error(e);
          }
        );
      });

      client.on("error", err => utils.error(`UDP client error: ${err}`));

      client.on("close", function() {
        return clients.delItem(key);
      });
    }

    let dataToSend = data.slice(sendDataOffset, data.length);
    if (isLocal) {
      dataToSend = encrypt(password, method, dataToSend);
      if (dataToSend == null) {
        return;
      }
    }

    if (serverPort <= 0 || serverPort >= 65536) {
      utils.error("port number err: " + serverPort);
      return;
    }
    return client.send(
      dataToSend,
      0,
      dataToSend.length,
      serverPort,
      serverAddr,
      (e, bytes) => {
        if (e) utils.error(e);
      }
    );
  });

  server.on("listening", function() {
    const address = server.address();
    return utils.info(
      `UDP server listening ${address.address}:${address.port}`
    );
  });

  server.on("close", function() {
    return clients.destroy();
  });

  server.bind(listenPort, listenAddr);

  return server;
};
