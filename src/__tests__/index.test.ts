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
        let buffer: Buffer;

        switch (hex) {
          // MTU handshake
          case "0800000000":
            buffer = Buffer.from("080000000199", "hex");
            break;
          // getAppAndVersion
          case "0500000005b010000000":
            buffer = Buffer.from(
              "05000000130105424f4c4f5309312e302e302d7263399000",
              "hex",
            );
            break;
          // just used for a non resolving apdu
          case "0500000005b020000000":
            setTimeout(() => {
              buffer = Buffer.from("05000000029000", "hex");
              startNotificationCb(new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength))
            }, 600);
            return Promise.resolve();
          default:
            throw new Error('Unexpected input')
        }

        startNotificationCb(new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength))
        return Promise.resolve()
      }
    } satisfies Partial<BleClientInterface>
  }
});

describe("BleTransport connectivity test coverage", () => {
  const scanResult: ScanResult = {
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
      const transport = await BleTransport.open(scanResult);
      expect(transport.isConnected).toBe(true);
    });

    it("should be disconnectable, and cleanup", async () => {
      const transport = await BleTransport.open(scanResult);
      await BleTransport.disconnect(scanResult.device.deviceId)
      expect(transport.isConnected).toBe(false);
    });

    it("should disconnect in 500ms (5s default) after calling close", async () => {
      const transport = await BleTransport.open(scanResult);
      expect(transport.isConnected).toBe(true);

      BleTransport.disconnectTimeoutMs = 500;
      await transport.close();

      // Expect the timeout for disconnection to be set
      expect(transport.disconnectTimeout).not.toBe(undefined);
      let resolve: (value: void) => void;

      transport.on("disconnect", () => {
        resolve();
      });

      return await new Promise((_resolve, _reject) => {
        resolve = _resolve;
      });
    });

    it("should cancel disconnect if new connection is made", async () => {
      const transport = await BleTransport.open(scanResult);
      expect(transport.isConnected).toBe(true);

      BleTransport.disconnectTimeoutMs = 500;
      await transport.close();

      // Expect the timeout for disconnection to be set
      expect(transport.disconnectTimeout).not.toBe(undefined);
      // Nb due to the different environments, the timeout behaves differently here
      // and I can't check against a number for it to be cleared or not.
      expect((transport.disconnectTimeout as any)._destroyed).toBe(false);
      await BleTransport.open(scanResult);
      expect((transport.disconnectTimeout as any)._destroyed).toBe(true);
    });

    it("should cancel disconnect if already disconnected", async () => {
      const transport = await BleTransport.open(scanResult);
      expect(transport.isConnected).toBe(true);

      BleTransport.disconnectTimeoutMs = 500;
      await transport.close();

      // Expect the timeout for disconnection to be set
      expect(transport.disconnectTimeout).not.toBe(undefined);
      // Nb due to the different environments, the timeout behaves differently here
      // and I can't check against a number for it to be cleared or not.
      expect((transport.disconnectTimeout as any)._destroyed).toBe(false);
      await BleTransport.disconnect(scanResult.device.deviceId);
      expect((transport.disconnectTimeout as any)._destroyed).toBe(true);
    });

    it("should handle exchanges if all goes well", async () => {
      const transport = await BleTransport.open(scanResult);
      expect(transport.isConnected).toBe(true);

      const response = await transport.exchange(Buffer.from("b010000000", "hex"));
      expect(response.toString("hex")).toBe("0105424f4c4f5309312e302e302d7263399000");
    });

    it("should throw on exchanges if disconnected", async () => {
      const transport = await BleTransport.open(scanResult);
      expect(transport.isConnected).toBe(true);
      await BleTransport.disconnect(scanResult.device.deviceId);
      expect(transport.isConnected).toBe(false);
      await expect(transport.exchange(Buffer.from("b010000000", "hex"))).rejects.toThrow(); // More specific errors some day.
    });

    it("should disconnect if close is called, even if pending response", done => {
      // This is actually a very important test, if we have an ongoing apdu response,
      // as in, the device never replied, but we expressed the intention of disconnecting
      // we will give it a few seconds and then disconnect regardless. Otherwise we fall
      // in the never ending await trap.
      async function asyncFn() {
        const transport = await BleTransport.open(scanResult);
        expect(transport.isConnected).toBe(true);
        transport.exchange(Buffer.from("b020000000", "hex"));
        BleTransport.disconnectTimeoutMs = 500;

        transport.on("disconnect", () => {
          done(); // If this is never called, then we're still waiting.
        });
        await transport.close();

        // Expect the timeout for disconnection to be set
        expect(transport.disconnectTimeout).not.toBe(undefined);
      }

      asyncFn();
    });
  });
});
