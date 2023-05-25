/// <reference types="node" />
import Transport from "@ledgerhq/hw-transport";
import { BluetoothInfos } from "@ledgerhq/devices";
import type { DeviceModel } from "@ledgerhq/devices";
import { Observable } from "rxjs";
import { ScanResult } from "@capacitor-community/bluetooth-le/dist/esm/definitions";
export declare const monitorCharacteristic: (deviceId: string, service: string, characteristic: string) => Observable<Buffer>;
/**
 * Ionic bluetooth BLE implementation
 */
export default class BleTransport extends Transport {
    static disconnectTimeoutMs: number;
    static isSupported: () => Promise<boolean>;
    static connect: (deviceId: string) => Promise<void>;
    static list: (stopScanTimeout?: number) => Promise<ScanResult[]>;
    static open(scanResult: ScanResult): Promise<BleTransport>;
    /**
     * Exposed method from the @capacitor-community/bluetooth-le library
     * Disconnects from {@link ScanResult} if it's connected or cancels pending connection.
     */
    static disconnect: (id: string) => Promise<void>;
    device: ScanResult;
    deviceModel: DeviceModel;
    disconnectTimeout: null | ReturnType<typeof setTimeout>;
    id: string;
    isConnected: boolean;
    mtuSize: number;
    notifyObservable: Observable<Buffer>;
    writeCharacteristic: string;
    writeCmdCharacteristic: string | undefined;
    bluetoothInfos: BluetoothInfos;
    constructor(device: ScanResult, writeCharacteristic: string, writeCmdCharacteristic: string | undefined, notifyObservable: Observable<Buffer>, deviceModel: DeviceModel, bluetoothInfos: BluetoothInfos);
    /**
     * Send data to the device using a low level API.
     * It's recommended to use the "send" method for a higher level API.
     * @param {Buffer} apdu - The data to send.
     * @returns {Promise<Buffer>} A promise that resolves with the response data from the device.
     */
    exchange: (apdu: Buffer) => Promise<Buffer>;
    /**
     * Negotiate with the device the maximum transfer unit for the ble frames
     * @returns Promise<number>
     */
    inferMTU(): Promise<number>;
    /**
     * Do not call this directly unless you know what you're doing. Communication
     * with a Ledger device should be through the {@link exchange} method.
     * @param buffer
     */
    write: (buffer: Buffer) => Promise<void>;
    /**
     * We intentionally do not immediately close a transport connection.
     * Instead, we queue the disconnect and wait for a future connection to dismiss the event.
     * This approach prevents unnecessary disconnects and reconnects. We use the isConnected
     * flag to ensure that we do not trigger a disconnect if the current cached transport has
     * already been disconnected.
     * @returns {Promise<void>}
     */
    close(): Promise<void>;
}
