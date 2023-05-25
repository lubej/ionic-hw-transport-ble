"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitorCharacteristic = void 0;
const hw_transport_1 = __importDefault(require("@ledgerhq/hw-transport"));
const bluetooth_le_1 = require("@capacitor-community/bluetooth-le");
const sendAPDU_1 = require("@ledgerhq/devices/lib/ble/sendAPDU");
const receiveAPDU_1 = require("@ledgerhq/devices/lib/ble/receiveAPDU");
const devices_1 = require("@ledgerhq/devices");
const logs_1 = require("@ledgerhq/logs");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const errors_1 = require("@ledgerhq/errors");
const TAG = "ble-verbose";
const monitorCharacteristic = (deviceId, service, characteristic) => {
    (0, logs_1.log)("ble-verbose", "start monitor " + service);
    return new rxjs_1.Observable(subscriber => {
        bluetooth_le_1.BleClient.startNotifications(deviceId, service, characteristic, rawData => {
            const value = Buffer.from(new Uint8Array(rawData.buffer));
            subscriber.next(value);
        });
    });
};
exports.monitorCharacteristic = monitorCharacteristic;
const transportsCache = {};
let _bleClient = null;
const bleInstance = () => {
    if (!_bleClient) {
        bluetooth_le_1.BleClient.initialize({
            androidNeverForLocation: true
        });
        _bleClient = bluetooth_le_1.BleClient;
    }
    return _bleClient;
};
const clearDisconnectTimeout = (deviceId) => {
    const cachedTransport = transportsCache[deviceId];
    if (cachedTransport && cachedTransport.disconnectTimeout) {
        (0, logs_1.log)(TAG, "Clearing queued disconnect");
        clearTimeout(cachedTransport.disconnectTimeout);
    }
};
const open = (scanResult) => __awaiter(void 0, void 0, void 0, function* () {
    (0, logs_1.log)(TAG, `Tries to open device: ${scanResult}`);
    try {
        (0, logs_1.log)(TAG, `connectToDevice(${scanResult})`);
        yield BleTransport.connect(scanResult.device.deviceId);
    }
    catch (error) {
        (0, logs_1.log)(TAG, `error code ${String(error)}`);
        throw new errors_1.CantOpenDevice();
    }
    let bluetoothInfos;
    let characteristics = [];
    for (const uuid of (0, devices_1.getBluetoothServiceUuids)()) {
        if (scanResult.uuids) {
            const peripheralCharacteristic = scanResult.uuids.filter((service) => service === uuid);
            if (peripheralCharacteristic.length) {
                characteristics.push(...peripheralCharacteristic);
                bluetoothInfos = (0, devices_1.getInfosForServiceUuid)(uuid);
                break;
            }
        }
    }
    if (!bluetoothInfos) {
        throw new errors_1.TransportError("service not found", "BLEServiceNotFound");
    }
    const { deviceModel, serviceUuid, writeUuid, writeCmdUuid, notifyUuid } = bluetoothInfos;
    if (!characteristics) {
        if (scanResult.uuids) {
            const characteristic = scanResult.uuids.find((uuid) => uuid === serviceUuid);
            if (characteristic) {
                characteristics = [characteristic];
            }
        }
    }
    if (!characteristics.length) {
        throw new errors_1.TransportError("service not found", "BLEServiceNotFound");
    }
    if (!writeUuid) {
        throw new errors_1.TransportError("write characteristic not found", "BLECharacteristicNotFound");
    }
    if (!notifyUuid) {
        throw new errors_1.TransportError("notify characteristic not found", "BLECharacteristicNotFound");
    }
    if (!writeUuid) {
        throw new errors_1.TransportError("write cmd characteristic not found", "BLECharacteristicInvalid");
    }
    const notifyObservable = (0, exports.monitorCharacteristic)(scanResult.device.deviceId, serviceUuid, notifyUuid).pipe((0, operators_1.share)());
    notifyObservable.subscribe();
    const transport = new BleTransport(scanResult, writeUuid, writeCmdUuid, notifyObservable, deviceModel, bluetoothInfos);
    transportsCache[transport.id] = transport;
    yield transport.inferMTU();
    return transport;
});
/**
 * Ionic bluetooth BLE implementation
 */
class BleTransport extends hw_transport_1.default {
    static open(scanResult) {
        return __awaiter(this, void 0, void 0, function* () {
            return open(scanResult);
        });
    }
    constructor(device, writeCharacteristic, writeCmdCharacteristic, notifyObservable, deviceModel, bluetoothInfos) {
        super();
        this.disconnectTimeout = null;
        this.isConnected = true;
        this.mtuSize = 20;
        /**
         * Send data to the device using a low level API.
         * It's recommended to use the "send" method for a higher level API.
         * @param {Buffer} apdu - The data to send.
         * @returns {Promise<Buffer>} A promise that resolves with the response data from the device.
         */
        this.exchange = (apdu) => __awaiter(this, void 0, void 0, function* () {
            return this.exchangeAtomicImpl(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    const msgIn = apdu.toString("hex");
                    (0, logs_1.log)("apdu", `=> ${msgIn}`);
                    const data = yield (0, rxjs_1.merge)(this.notifyObservable.pipe(receiveAPDU_1.receiveAPDU), (0, sendAPDU_1.sendAPDU)(this.write, apdu, this.mtuSize)).toPromise();
                    const msgOut = data.toString("hex");
                    (0, logs_1.log)("apdu", `<= ${msgOut}`);
                    return data;
                }
                catch (e) {
                    (0, logs_1.log)("ble-error", "exchange got " + String(e));
                }
            }));
        });
        /**
         * Do not call this directly unless you know what you're doing. Communication
         * with a Ledger device should be through the {@link exchange} method.
         * @param buffer
         */
        this.write = (buffer) => __awaiter(this, void 0, void 0, function* () {
            (0, logs_1.log)("ble-frame", "=> " + buffer.toString("hex"));
            if (this.writeCmdCharacteristic) {
                try {
                    const data = new DataView(buffer.buffer);
                    return bleInstance().writeWithoutResponse(this.device.device.deviceId, this.bluetoothInfos.serviceUuid, this.bluetoothInfos.writeCmdUuid, data);
                }
                catch (e) {
                    throw new errors_1.DisconnectedDeviceDuringOperation(String(e));
                }
            }
            else {
                try {
                    const data = new DataView(buffer.buffer);
                    bleInstance().write(this.device.device.deviceId, this.bluetoothInfos.serviceUuid, this.bluetoothInfos.writeUuid, data);
                }
                catch (e) {
                    throw new errors_1.DisconnectedDeviceDuringOperation(String(e));
                }
            }
        });
        this.id = device.device.deviceId;
        this.device = device;
        this.writeCharacteristic = writeCharacteristic;
        this.writeCmdCharacteristic = writeCmdCharacteristic;
        this.notifyObservable = notifyObservable;
        this.deviceModel = deviceModel;
        this.bluetoothInfos = bluetoothInfos;
        (0, logs_1.log)(TAG, `BLE(${String(this.id)}) new instance`);
        clearDisconnectTimeout(this.id);
    }
    /**
     * Negotiate with the device the maximum transfer unit for the ble frames
     * @returns Promise<number>
     */
    inferMTU() {
        return __awaiter(this, void 0, void 0, function* () {
            let mtu = this.mtuSize;
            yield this.exchangeAtomicImpl(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    mtu = yield (0, rxjs_1.merge)(this.notifyObservable.pipe((0, operators_1.tap)((maybeError) => {
                        if (maybeError instanceof Error)
                            throw maybeError;
                    }), (0, operators_1.first)((buffer) => buffer.readUInt8(0) === 0x08), (0, operators_1.map)((buffer) => buffer.readUInt8(5))), (0, rxjs_1.defer)(() => (0, rxjs_1.from)(this.write(Buffer.from([0x08, 0, 0, 0, 0])))).pipe((0, operators_1.ignoreElements)())).toPromise();
                }
                catch (e) {
                    (0, logs_1.log)("ble-error", "inferMTU got " + JSON.stringify(e));
                    try {
                        yield bleInstance().disconnect(this.device.device.deviceId);
                    }
                    catch (ex) {
                        // Ignore error
                    }
                    throw e;
                }
            }));
            if (mtu > 20) {
                this.mtuSize = mtu;
                (0, logs_1.log)(TAG, `BleTransport(${this.id}) mtu set to ${this.mtuSize}`);
            }
            return this.mtuSize;
        });
    }
    /**
     * We intentionally do not immediately close a transport connection.
     * Instead, we queue the disconnect and wait for a future connection to dismiss the event.
     * This approach prevents unnecessary disconnects and reconnects. We use the isConnected
     * flag to ensure that we do not trigger a disconnect if the current cached transport has
     * already been disconnected.
     * @returns {Promise<void>}
     */
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            let resolve;
            const disconnectPromise = new Promise((innerResolve) => {
                resolve = innerResolve;
            });
            clearDisconnectTimeout(this.id);
            (0, logs_1.log)(TAG, "Queuing a disconnect");
            this.disconnectTimeout = global.setTimeout(() => {
                (0, logs_1.log)(TAG, `Triggering a disconnect from ${this.id}`);
                if (this.isConnected) {
                    try {
                        BleTransport.disconnect(this.id);
                    }
                    finally {
                        resolve();
                    }
                }
                else {
                    resolve();
                }
            }, BleTransport.disconnectTimeoutMs);
            // The closure will occur no later than 5s, triggered either by disconnection
            // or the actual response of the apdu.
            yield Promise.race([
                this.exchangeBusyPromise || Promise.resolve(),
                disconnectPromise,
            ]);
            return;
        });
    }
}
_a = BleTransport;
BleTransport.disconnectTimeoutMs = 5000;
BleTransport.isSupported = () => Promise.resolve(typeof bluetooth_le_1.BleClient === "object");
BleTransport.connect = (deviceId) => {
    return bleInstance().connect(deviceId);
};
BleTransport.list = (stopScanTimeout = BleTransport.disconnectTimeoutMs) => {
    let devices = [];
    return new Promise((resolve, reject) => {
        bleInstance().requestLEScan({ services: (0, devices_1.getBluetoothServiceUuids)() }, data => {
            devices = [
                ...devices.filter(prevDevice => prevDevice.device.deviceId !== data.device.deviceId),
                data
            ];
        });
        setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
            yield bleInstance().stopLEScan();
            try {
                (0, logs_1.log)(TAG, 'BLE scan complete');
                resolve(devices);
            }
            catch (err) {
                (0, logs_1.log)(TAG, 'BLE scan failed');
                reject(err);
            }
        }), stopScanTimeout);
    });
};
/**
 * Exposed method from the @capacitor-community/bluetooth-le library
 * Disconnects from {@link ScanResult} if it's connected or cancels pending connection.
 */
BleTransport.disconnect = (id) => __awaiter(void 0, void 0, void 0, function* () {
    (0, logs_1.log)(TAG, `user disconnect(${id})`);
    yield bleInstance().disconnect(id);
    (0, logs_1.log)(TAG, "disconnected");
});
exports.default = BleTransport;
