'use strict';

const Int64 = require('node-int64');

const generateUuid = require('./common').uuid;

const ErrorCode = require('./ErrorCode');

const BufferPlus = require('buffer-plus');

const MSG_TYPE = {
  req: 1,
  res: 2,
  push: 3,
  pull: 4,
  pub: 5,
  sub: 6,
  ack: 7,
  mon: 0xf0,
  sreq: 0xff
};
const MSG_CONTENT_TYPE = {
  raw: 1,
  json: 2,
  str: 3
};
BufferPlus.addCustomType('type', buffer => {
  return getMessageTypeKey(buffer.readUInt8());
}, (buffer, value) => {
  buffer.writeUInt8(MSG_TYPE[value]);
}, value => {
  return 1;
});
BufferPlus.addCustomType('contentType', buffer => {
  return getContentType(buffer.readUInt8());
}, (buffer, value) => {
  buffer.writeUInt8(MSG_CONTENT_TYPE[value]);
}, value => {
  return 1;
});
BufferPlus.createSchema('RequestResponseHeader', {
  type: 'object',
  properties: {
    id: {
      type: 'uint64be'
    },
    type: {
      type: 'custom',
      name: 'type'
    },
    contentType: {
      type: 'custom',
      name: 'contentType'
    },
    error: {
      type: 'uint8'
    },
    topic: {
      type: 'string'
    },
    source: {
      type: 'string'
    },
    target: {
      type: 'string'
    }
  },
  order: ['id', 'type', 'contentType', 'error', 'topic', 'source', 'target']
});
BufferPlus.createSchema('PublishHeader', {
  type: 'object',
  properties: {
    id: {
      type: 'uint64be'
    },
    type: {
      type: 'custom',
      name: 'type'
    },
    contentType: {
      type: 'custom',
      name: 'contentType'
    },
    topic: {
      type: 'string'
    },
    source: {
      type: 'string'
    },
    target: {
      type: 'string'
    }
  },
  order: ['id', 'type', 'contentType', 'topic', 'source', 'target']
});
BufferPlus.createSchema('SubscribeHeader', {
  type: 'object',
  properties: {
    id: {
      type: 'uint64be'
    },
    type: {
      type: 'custom',
      name: 'type'
    },
    contentType: {
      type: 'custom',
      name: 'contentType'
    },
    topic: {
      type: 'string'
    },
    source: {
      type: 'string'
    }
  },
  order: ['id', 'type', 'contentType', 'topic', 'source']
});
BufferPlus.createSchema('PushHeader', {
  type: 'object',
  properties: {
    id: {
      type: 'uint64be'
    },
    type: {
      type: 'custom',
      name: 'type'
    },
    contentType: {
      type: 'custom',
      name: 'contentType'
    },
    topic: {
      type: 'string'
    },
    source: {
      type: 'string'
    },
    target: {
      type: 'string'
    },
    itemCount: {
      type: 'uint32be'
    }
  },
  order: ['id', 'type', 'contentType', 'topic', 'source', 'target', 'itemCount']
});
BufferPlus.createSchema('PullHeader', {
  type: 'object',
  properties: {
    id: {
      type: 'uint64be'
    },
    type: {
      type: 'custom',
      name: 'type'
    },
    contentType: {
      type: 'custom',
      name: 'contentType'
    },
    topic: {
      type: 'string'
    },
    source: {
      type: 'string'
    }
  },
  order: ['id', 'type', 'contentType', 'topic', 'source']
});
BufferPlus.createSchema('AckHeader', {
  type: 'object',
  properties: {
    id: {
      type: 'uint64be'
    },
    type: {
      type: 'custom',
      name: 'type'
    },
    topic: {
      type: 'string'
    }
  },
  order: ['id', 'type', 'topic']
});
BufferPlus.createSchema('MonitorHeader', {
  type: 'object',
  properties: {
    id: {
      type: 'uint64be'
    },
    type: {
      type: 'custom',
      name: 'type'
    },
    contentType: {
      type: 'custom',
      name: 'contentType'
    }
  },
  order: ['id', 'type', 'contentType']
});
const bp = BufferPlus.allocUnsafe(4096);

function isIterable(obj) {
  if (obj === null || obj === undefined) {
    return false;
  }

  return typeof obj[Symbol.iterator] === 'function';
}

function getMessageTypeKey(val) {
  for (const key in MSG_TYPE) {
    if (val === MSG_TYPE[key]) {
      return key;
    }
  }

  return null;
}

function getContentType(type) {
  let contentType;

  switch (type) {
    case 1:
      contentType = 'raw';
      break;

    case 2:
      contentType = 'json';
      break;

    case 3:
      contentType = 'string';
      break;

    default:
      contentType = '';
      break;
  }

  return contentType;
}

function checkType(type) {
  return MSG_TYPE[type] ? true : false;
}

function checkContentType(type) {
  return MSG_CONTENT_TYPE[type] ? true : false;
}

function parsePayloadBuffer(payloadBuf, contentType) {
  if (contentType === 'raw') {
    return payloadBuf;
  } else if (contentType === 'json') {
    if (payloadBuf.length === 0) {
      return null;
    }

    return JSON.parse(payloadBuf.toString('utf8'));
  } else {
    return payloadBuf.toString('utf8');
  }
}

class Message {
  constructor(type, id, msgLen, headerLen) {
    this.messageLength = msgLen ? msgLen : 0;
    this.headerLength = headerLen ? headerLen : 0;
    this.header = {
      id: id ? id : generateUuid()
    };
    this.payload = undefined;
    this.payloadBuf = undefined;

    if (type) {
      this.setType(type);
    }
  }

  isRequest() {
    return this.header.type === 'req';
  }

  isServerRequest() {
    return this.header.type === 'sreq';
  }

  isResponse() {
    return this.header.type === 'res';
  }

  isPush() {
    return this.header.type === 'push';
  }

  isPull() {
    return this.header.type === 'pull';
  }

  isPublish() {
    return this.header.type === 'pub';
  }

  isSubscribe() {
    return this.header.type === 'sub';
  }

  isAck() {
    return this.header.type === 'ack';
  }

  isMonitor() {
    return this.header.type === 'mon';
  }

  getEventName() {
    return this.header.topic + '.' + this.header.id;
  }

  setType(type) {
    if (!checkType(type)) {
      throw new TypeError('Invalid message type: ' + type);
    }

    this.header.type = type;
  }

  setContentType(type) {
    if (!checkContentType(type)) {
      throw new TypeError('Invalid message content type: ' + type);
    }

    this.header.contentType = type;
  }

  setPayload(data, contentType) {
    if (contentType) {
      this.header.contentType = contentType;
    }

    this.payload = data;
  }

  setPayloadBuf(buf) {
    this.payloadBuf = buf;
  }

  fillPayload(buf) {
    this.payloadBuf = buf.slice(8 + this.headerLength, this.messageLength);
    this.payload = parsePayloadBuffer(this.payloadBuf, this.header.contentType);
  }

  getBuffer() {
    const headerBuf = this._getHeaderBuffer();

    this.headerLength = headerBuf.length;
    this.messageLength = 8 + this.headerLength;

    if (!this.payloadBuf && this.payload) {
      this.payloadBuf = this._getPayloadBuffer();
    }

    if (this.payloadBuf) {
      this.messageLength += this.payloadBuf.length;
    }

    const msgBuf = Buffer.allocUnsafe(this.messageLength);
    msgBuf.writeUInt32BE(this.messageLength);
    msgBuf.writeUInt32BE(this.headerLength, 4);
    headerBuf.copy(msgBuf, 8);

    if (this.payloadBuf) {
      this.payloadBuf.copy(msgBuf, 8 + this.headerLength);
    }

    return msgBuf;
  }

  _getPayloadBuffer() {
    const payload = this.payload;
    const contentType = this.header.contentType;
    let payloadBuf;

    if (!checkContentType(contentType)) {
      throw new TypeError('Unknown payload content type: ' + contentType);
    }

    if (contentType === 'raw') {
      payloadBuf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    } else if (contentType === 'json') {
      payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
    } else if (contentType === 'string') {
      payloadBuf = Buffer.from(payload);
    }

    return payloadBuf;
  }

}

class RequestMessage extends Message {
  constructor(id, msgLen, headerLen, type) {
    super(type ? type : 'req', id, msgLen, headerLen);
  }

  createFromBuffer(buf) {
    const headerBuf = buf.slice(8, 8 + this.headerLength);
    const bufStream = BufferPlus.from(headerBuf);
    this.header = bufStream.readSchema('RequestResponseHeader');
    this.fillPayload(buf);
    return this;
  }

  _getHeaderBuffer() {
    const header = this.header;
    bp.reset();
    bp.writeSchema('RequestResponseHeader', header);
    return bp.toBuffer();
  }

  setTopic(topic) {
    this.header.topic = topic;
  }

  setSource(source) {
    this.header.source = source;
  }

  setTarget(target) {
    this.header.target = target;
  }

}

class ServerRequestMessage extends RequestMessage {
  constructor(id, msgLen, headerLen) {
    super(id, msgLen, headerLen, 'sreq');
  }

}

class ResponseMessage extends RequestMessage {
  constructor(id, msgLen, headerLen) {
    super(id, msgLen, headerLen, 'res');
  }

  isError(value) {
    const errCode = typeof value === 'string' ? ErrorCode[value] : code;

    if (errCode === undefined) {
      return false;
    }

    return this.header.error === errCode;
  }

  setError(code) {
    if (typeof code !== 'number') {
      throw new TypeError('Invalid message error code: ' + code);
    }

    this.header.error = code;
  }

}

class PublishMessage extends Message {
  constructor(id, msgLen, headerLen) {
    super('pub', id, msgLen, headerLen);
  }

  createFromBuffer(buf) {
    const headerBuf = buf.slice(8, 8 + this.headerLength);
    const bufStream = BufferPlus.from(headerBuf);
    this.header = bufStream.readSchema('PublishHeader');
    this.fillPayload(buf);
    return this;
  }

  _getHeaderBuffer() {
    const header = this.header;
    bp.reset();
    bp.writeSchema('PublishHeader', header);
    return bp.toBuffer();
  }

  setTopic(topic) {
    this.header.topic = topic;
  }

  setSource(source) {
    this.header.source = source;
  }

  setTarget(target) {
    this.header.target = target;
  }

}

class SubscribeMessage extends Message {
  constructor(id, msgLen, headerLen) {
    super('sub', id, msgLen, headerLen);
  }

  createFromBuffer(buf) {
    const headerBuf = buf.slice(8, 8 + this.headerLength);
    const bufStream = BufferPlus.from(headerBuf);
    this.header = bufStream.readSchema('SubscribeHeader');
    this.fillPayload(buf);
    return this;
  }

  _getHeaderBuffer() {
    const header = this.header;
    bp.reset();
    bp.writeSchema('SubscribeHeader', header);
    return bp.toBuffer();
  }

  setSource(source) {
    this.header.source = source;
  }

  setTopic(topic) {
    this.header.topic = topic;
  }

}

class PushMessage extends Message {
  constructor(id, msgLen, headerLen) {
    super('push', id, msgLen, headerLen);
    this.payload = [];
    this.items = [];
  }

  createFromBuffer(buf) {
    const headerBuf = buf.slice(8, 8 + this.headerLength);
    const bufStream = BufferPlus.from(headerBuf);
    this.header = bufStream.readSchema('PushHeader');
    const payloadBuf = buf.slice(8 + this.headerLength, this.messageLength);
    this.items = this._splitPayloadToItems(payloadBuf);
    return this;
  }

  _getHeaderBuffer() {
    const header = this.header;
    bp.reset();
    bp.writeSchema('PushHeader', header);
    return bp.toBuffer();
  }

  _splitPayloadToItems(payloadBuf) {
    const itemCount = this.header.itemCount;
    const payloadSize = payloadBuf.length;
    const bufStream = BufferPlus.from(payloadBuf);
    const items = [];

    for (let i = 0; i < itemCount; i++) {
      const itemLen = bufStream.readUInt32BE();

      if (bufStream.offset + itemLen > payloadSize) {
        throw new RangeError('Payload buffer is smaller than expected.');
      }

      const itemBuf = bufStream.readBuffer(itemLen);
      items.push(itemBuf);
    }

    return items;
  }

  _getPayloadBuffer() {
    const payload = this.payload;
    const contentType = this.header.contentType;

    if (!checkContentType(contentType)) {
      throw new TypeError('Unknown payload content type: ' + contentType);
    }

    if (!isIterable(payload)) {
      throw new TypeError('payload should be an iterable object.');
    }

    if (payload.length !== this.header.itemCount) {
      throw new TypeError('payload length should be equal to itemCount.');
    }

    const itemBufs = [];

    if (contentType === 'raw') {
      for (const i in payload) {
        if (!Object.prototype.hasOwnProperty.call(payload, i)) {
          continue;
        }

        const item = payload[i];
        const contentBuf = Buffer.isBuffer(item) ? item : Buffer.from(item);
        const itemBuf = Buffer.allocUnsafe(contentBuf.length + 4);
        itemBuf.writeUInt32BE(contentBuf.length, 0);
        contentBuf.copy(itemBuf, 4);
        itemBufs.push(itemBuf);
      }
    } else if (contentType === 'json') {
      for (const i in payload) {
        if (!Object.prototype.hasOwnProperty.call(payload, i)) {
          continue;
        }

        const item = payload[i];
        const contentBuf = Buffer.from(JSON.stringify(item), 'utf8');
        const itemBuf = Buffer.allocUnsafe(contentBuf.length + 4);
        itemBuf.writeUInt32BE(contentBuf.length, 0);
        contentBuf.copy(itemBuf, 4);
        itemBufs.push(itemBuf);
      }
    } else if (contentType === 'string') {
      for (const i in payload) {
        if (!Object.prototype.hasOwnProperty.call(payload, i)) {
          continue;
        }

        const item = payload[i];
        const contentBuf = Buffer.from(item);
        const itemBuf = Buffer.allocUnsafe(contentBuf.length + 4);
        itemBuf.writeUInt32BE(contentBuf.length, 0);
        contentBuf.copy(itemBuf, 4);
        itemBufs.push(itemBuf);
      }
    }

    return Buffer.concat(itemBufs);
  }

  setTopic(topic) {
    this.header.topic = topic;
  }

  setSource(source) {
    this.header.source = source;
  }

  setTarget(target) {
    this.header.target = target;
  }

  setItemCount(itemCount) {
    this.header.itemCount = itemCount;
  }

  setPayload(data, contentType) {
    if (!isIterable(data)) {
      throw new TypeError('payload should be an iterable object.');
    }

    if (contentType) {
      this.header.contentType = contentType;
    }

    this.payload = data;
    this.header.itemCount = data.length;
  }

}

class PullMessage extends Message {
  constructor(id, msgLen, headerLen) {
    super('pull', id, msgLen, headerLen);
  }

  createFromBuffer(buf) {
    const headerBuf = buf.slice(8, 8 + this.headerLength);
    const bufStream = BufferPlus.from(headerBuf);
    this.header = bufStream.readSchema('PullHeader');
    this.fillPayload(buf);
    return this;
  }

  _getHeaderBuffer() {
    const header = this.header;
    bp.reset();
    bp.writeSchema('PullHeader', header);
    return bp.toBuffer();
  }

  setSource(source) {
    this.header.source = source;
  }

  setTopic(topic) {
    this.header.topic = topic;
  }

}

class AckMessage extends Message {
  constructor(id, msgLen, headerLen) {
    super('ack', id, msgLen, headerLen);
  }

  createFromBuffer(buf) {
    const headerBuf = buf.slice(8, 8 + this.headerLength);
    const bufStream = BufferPlus.from(headerBuf);
    this.header = bufStream.readSchema('AckHeader');
    return this;
  }

  _getHeaderBuffer() {
    const header = this.header;
    bp.reset();
    bp.writeSchema('AckHeader', header);
    return bp.toBuffer();
  }

  setTopic(topic) {
    this.header.topic = topic;
  }

}

class MonitorMessage extends Message {
  constructor(id, msgLen, headerLen) {
    super('mon', id, msgLen, headerLen);
  }

  createFromBuffer(buf) {
    const headerBuf = buf.slice(8, 8 + this.headerLength);
    const bufStream = BufferPlus.from(headerBuf);
    this.header = bufStream.readSchema('MonitorHeader');
    this.fillPayload(buf);
    return this;
  }

  _getHeaderBuffer() {
    const header = this.header;
    bp.reset();
    bp.writeSchema('MonitorHeader', header);
    return bp.toBuffer();
  }

}

exports.create = function (type, id) {
  if (type === 'req') {
    return new RequestMessage(id);
  } else if (type === 'res') {
    return new ResponseMessage(id);
  } else if (type === 'push') {
    return new PushMessage(id);
  } else if (type === 'pull') {
    return new PullMessage(id);
  } else if (type === 'pub') {
    return new PublishMessage(id);
  } else if (type === 'sub') {
    return new SubscribeMessage(id);
  } else if (type === 'ack') {
    return new AckMessage(id);
  } else if (type === 'mon') {
    return new MonitorMessage(id);
  } else if (type === 'sreq') {
    return new ServerRequestMessage(id);
  } else {
    throw new TypeError("Message type:".concat(type, " is not valid."));
  }
};

exports.createFromBuffer = function (buf) {
  const msgLen = buf.readUInt32BE(0);
  const headerLen = buf.readUInt32BE(4);
  const id = new Int64(buf, 8).toNumber();
  const type = getMessageTypeKey(buf.readUInt8(16, true));
  let msg;

  if (type === 'req') {
    msg = new RequestMessage(id, msgLen, headerLen);
  } else if (type === 'res') {
    msg = new ResponseMessage(id, msgLen, headerLen);
  } else if (type === 'push') {
    msg = new PushMessage(id, msgLen, headerLen);
  } else if (type === 'pull') {
    msg = new PullMessage(id, msgLen, headerLen);
  } else if (type === 'pub') {
    msg = new PublishMessage(id, msgLen, headerLen);
  } else if (type === 'sub') {
    msg = new SubscribeMessage(id, msgLen, headerLen);
  } else if (type === 'ack') {
    msg = new AckMessage(id, msgLen, headerLen);
  } else if (type === 'mon') {
    msg = new MonitorMessage(id, msgLen, headerLen);
  } else if (type === 'sreq') {
    msg = new ServerRequestMessage(id, msgLen, headerLen);
  } else {
    throw new TypeError("Message type:".concat(type, ":").concat(buf.readUInt8(16), " is not valid."));
  }

  msg.createFromBuffer(buf);
  return msg;
};