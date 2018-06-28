# shadowsocks-lite

[![Build Status](https://travis-ci.org/derekchuank/shadowsocks-lite.svg?branch=master)](https://travis-ci.org/derekchuank/shadowsocks-lite)
[![npm version](https://badge.fury.io/js/shadowsocks-lite.svg)](http://badge.fury.io/js/shadowsocks-lite)

## Super simple to use

Socks5 proxy client and server.

## Usage

1.  Create a file named `config.json`, with the following content:

```
    {
      "server":"my_server_ip",
      "server_port":8388,
      "local_address": "127.0.0.1",
      "local_port":1080,
      "password":"foobar"
    }
```

Alternatively, you can specify multiple server addresses on client, and we will select the best to use automatically.

```
    {
      "server":["my_server_ip1",'my_server_ip2"],
      "server_port":8388,
      "local_address": "127.0.0.1",
      "local_port":1080,
      "password":"foobar"
    }
```

2.  `cd` into the directory of `config.json`.

3.  On your server, run:

```
    npm install -g shadowsocks-lite
    sslserver
```

4.  On your client, run:

```
    npm install -g shadowsocks-lite
    ssllocal
```

5.  Change the proxy setting in your browser.

```
    protocol: socks5
    hostname: 127.0.0.1
    port: 1080
```
