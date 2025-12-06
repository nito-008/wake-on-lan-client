import mqtt, { IClientOptions, MqttClient } from "mqtt";
import { QoS } from "mqtt-packet";
import { useEffect, useState } from "react";
import styles from "./DeviceList.module.css";
import axios, { AxiosResponse } from "axios";
import { DeviceItem } from "./DeviceItem";

type APIResponse = {
  DeviceName: string;
  MacAddress: string;
  IPAddress: string;
};

type Device = {
  name: string;
  macAddress: string;
  ipAddress: string;
  isActive: boolean;
  setIsActive: React.Dispatch<React.SetStateAction<boolean>>;
};

export type MqttContext = {
  topic: string;
  qos: QoS;
  payload: string | Buffer;
};

const mqttOptions = {
  keepalive: 60,
  clientId: "emqx_react_" + Math.random().toString(16).substring(2, 8),
  protocolId: "MQTT",
  protocolVersion: 5,
  clean: true,
  connectTimeout: 30 * 1000,
  will: {
    topic: "will",
    payload: "Connection closed abnormally.",
    qos: 0,
    retain: false,
  },
  username: import.meta.env.VITE_MQTT_USERNAME,
  password: import.meta.env.VITE_MQTT_PASSWORD,
} as mqtt.IClientOptions;

const MQTT_TOPIC_DEBUG = "/debug";

export type Subscription = {
  topic: string | string[] | mqtt.ISubscriptionMap;
  qos: QoS;
};

export const DeviceList = () => {
  const [client, setClient] = useState<MqttClient | null>(null);
  const [connectStatus, setConnectStatus] = useState("Connecting...");
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [debugMessage, setDebugMessage] = useState("");

  const mqttConnect = (options: IClientOptions) => {
    setClient(mqtt.connect(import.meta.env.VITE_MQTT_BROKER_URL, options));
    console.log("Client created");
  };

  const mqttPublish = (context: MqttContext) => {
    if (client) {
      const { topic, qos, payload } = context;
      client.publish(topic, payload, { qos }, (error) => {
        if (error) {
          console.log("Publish error: ", error);
        }
      });
    }
  };

  const mqttSubscribe = (subscription: Subscription) => {
    if (client) {
      const { topic, qos } = subscription;

      client.subscribe(topic, { qos }, (error) => {
        if (error) {
          console.log("Subscribe to topics error: ", error);
          return;
        }
        console.log("Subscribed topic: ", topic);
      });
    }
  };

  if (!client || client.disconnected) {
    mqttConnect(mqttOptions);
    axios
      .get(import.meta.env.VITE_DB_API_URL, {
        headers: { "x-api-key": import.meta.env.VITE_DB_API_KEY },
      })
      .then((response: AxiosResponse<Array<APIResponse>>) => {
        console.log(response.data);

        setDevices(
          response.data.map((device) => {
            return {
              name: device.DeviceName,
              macAddress: device.MacAddress,
              ipAddress: device.IPAddress,
            } as Device;
          })
        );
      })
      .catch((error) => console.error("Error fetching data: ", error));
  }

  useEffect(() => {
    if (client) {
      console.log(client);
      client.on("connect", () => {
        setConnectStatus("Connected");
      });
      client.on("error", (err) => {
        console.error("Connection error: ", err);
        client.end();
      });
      client.on("reconnect", () => {
        setConnectStatus("Reconnecting");
      });
      client.on("disconnect", (packet) => {
        console.log("Disconnected: ", packet);
      });

      client.on("message", (topic, payload) => {
        if (topic === MQTT_TOPIC_DEBUG) {
          const message = payload.toString();
          setDebugMessage(message);
        }
      });
    }
  }, [client]);

  useEffect(() => {
    const deviceStateTopics = devices?.flatMap((device) => {
      return `/${device.name}/state`;
    });

    if (deviceStateTopics) mqttSubscribe({ topic: deviceStateTopics, qos: 1 });
    mqttSubscribe({ topic: MQTT_TOPIC_DEBUG, qos: 1 });
  }, [devices]);

  return (
    <>
      <p className={styles.row}>MQTT Status: {connectStatus}</p>
      <p className={styles.row}>Debug Message: {debugMessage}</p>
      {devices ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>DEVICE</th>
              <th>STATUS</th>
              <th>BUTTON</th>
            </tr>
          </thead>
          <tbody>
            {devices.map(({ name, macAddress }) => (
              <DeviceItem
                name={name}
                mqttPublish={mqttPublish}
                client={client}
                key={macAddress}
              ></DeviceItem>
            ))}
          </tbody>
        </table>
      ) : (
        "Failed to get device data"
      )}
    </>
  );
};
