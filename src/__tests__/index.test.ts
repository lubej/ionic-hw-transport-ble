import BleTransport from "../index";
import {ScanResult, BleClientInterface} from "@capacitor-community/bluetooth-le";

jest.mock("@capacitor-community/bluetooth-le", () => {
  let startNotificationCb = (value: DataView) => {
  };
  let onDisconnectCb = (deviceId: string) => {
  };

  return {
    BleClient: {
      initialize(): Promise<void> {
        return Promise.resolve()
      },
      connect(deviceId: string, onDisconnect): Promise<void> {
        if (onDisconnect) {
          onDisconnectCb = onDisconnect
        }
        return Promise.resolve()
      },
      disconnect(deviceId): Promise<void> {
        onDisconnectCb(deviceId);
        return Promise.resolve()
      },
      startNotifications(deviceId: string, service: string, characteristic: string, callback: (value: DataView) => void): Promise<void> {
        startNotificationCb = callback
        return Promise.resolve()
      },
      writeWithoutResponse(deviceId: string, service: string, characteristic: string, value: DataView): Promise<void> {
        const hex = Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('hex')
        let returnValue: DataView;

        switch (hex) {
          // MTU handshake
          case "0800000000":
            const buffer = Buffer.from("080000000199", "hex");
            returnValue = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
            break;
          default:
            throw new Error('Unexpected input')
        }

        startNotificationCb(returnValue)
        return Promise.resolve()
      }
    } satisfies Partial<BleClientInterface>
  }
});

describe("BleTransport connectivity test coverage", () => {
  const device: ScanResult = {
    device: {
      deviceId: 'XX:XX:XX:XX:XX:XX',
      name: 'Nano X BXAX',
    },
    localName: 'Nano X BXAX',
    rssi: -50,
    txPower: 100,
    uuids: ['13d63400-2c97-6004-0000-4c6564676572']
  }

  describe("Device available and already paired", () => {
    it("should find the device, connect, negotiate MTU", async () => {
      const transport = await BleTransport.open(device);
      expect(transport.isConnected).toBe(true);
    });

    it("should be disconnectable, and cleanup", async () => {
      const transport = await BleTransport.open(device);
      await BleTransport.disconnect(device.device.deviceId)
      expect(transport.isConnected).toBe(false);
    });
  });
});
