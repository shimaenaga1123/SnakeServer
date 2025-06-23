// echo_server.js
import net from "node:net";
import knex from "knex";
import dotenv from "dotenv";

// 환경 변수 로드
dotenv.config();

// 데이터베이스 연결 옵션
const options = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT, 0),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "default_db",
};

// Knex.js 데이터베이스 구성
const dbConfig = {
  client: "mysql", // MySQL 드라이버 사용
  connection: options,
};
const db = knex(dbConfig);
db.on("error", (error) => {
  logger.error("데이터베이스 연결 오류:", error);
});

const PORT = 12345;
const HOST = "0.0.0.0"; // 어디서든 접속 허용

// IP별 연결 수 추적용 객체
const ipConnectionCount = {};
const MAX_CONNECTIONS_PER_IP = 10; // IP당 최대 연결 수

net
  .createServer((sock) => {
    const ip = sock.remoteAddress;
    ipConnectionCount[ip] = (ipConnectionCount[ip] || 0) + 1;
    if (ipConnectionCount[ip] > MAX_CONNECTIONS_PER_IP) {
      sock.write(
        JSON.stringify({ status: 429, text: "동일 IP에서의 최대 동시 접속 수를 초과했습니다." }) + "\n"
      );
      sock.destroy();
      ipConnectionCount[ip]--;
      return;
    }
    console.log("📡", ip);

    sock.on("data", (chunk) => {
      const raw = chunk.toString().trim();
      // accept single-quoted JSON by normalizing to double quotes
      const normalized = raw.replace(/'/g, '"');
      console.log(normalized);
      let parsed;
      try {
        parsed = JSON.parse(normalized);
      } catch (err) {
        console.error("❌ JSON 파싱 오류:", err);
        sock.write(JSON.stringify({ status: 400, text: err.message }) + "\n");
        return;
      }
      switch (parsed.to) {
        case "/check-connection": {
          sock.write(
            JSON.stringify({ status: 200, text: "서버에 연결되었습니다!" }) +
              "\n"
          );
          break;
        }

        case "/getClientID": {
          // 랜덤한 클라이언트 ID(char) 생성 16자
          const clientID = Math.random().toString(36).substring(2, 18);
          db("client")
            .insert({ uid: clientID, name: "Unknown", bestScore: 0 })
            .then(() => {
              console.log("클라이언트 ID 저장:", clientID);
            })
            .catch((err) => {
              console.error("데이터베이스 오류:", err);
              sock.write(
                JSON.stringify({ status: 500, text: "데이터베이스 오류" }) +
                  "\n"
              );
              return;
            });
          sock.write(JSON.stringify({ status: 200, text: clientID }) + "\n");
          break;
        }

        case "/getRoomIDList": {
          db("rooms")
            .select("id")
            .then((rows) => {
              const roomIDs = rows.map((row) => row.id);
              sock.write(
                JSON.stringify({
                  status: 200,
                  text: roomIDs.toString() + ";",
                }) + "\n"
              );
            })
            .catch((err) => {
              console.error("데이터베이스 오류:", err);
              sock.write(
                JSON.stringify({ status: 500, text: "데이터베이스 오류" }) +
                  "\n"
              );
            });
          break;
        }

        case "/getRoomInfo": {
          const { roomID } = parsed;
          if (!roomID) {
            sock.write(
              JSON.stringify({ status: 400, text: "roomID가 필요합니다." }) +
                "\n"
            );
            break;
          }
          db("rooms")
            .where({ id: roomID })
            .first()
            .then((row) => {
              if (row) {
                sock.write(JSON.stringify({ ...row, status: 200 }) + "\n");
              } else {
                sock.write(
                  JSON.stringify({
                    status: 404,
                    text: "방을 찾을 수 없습니다.",
                  }) + "\n"
                );
              }
            })
            .catch((err) => {
              console.error("데이터베이스 오류:", err);
              sock.write(
                JSON.stringify({ status: 500, text: "데이터베이스 오류" }) +
                  "\n"
              );
            });
          break;
        }

        case "/joinRoom": {
          const { roomID, clientID } = parsed;
          if (!roomID || !clientID) {
            sock.write(
              JSON.stringify({
                status: 400,
                text: "roomID와 clientID가 필요합니다.",
              }) + "\n"
            );
            break;
          }

          db("client")
            .where({ uid: clientID })
            .first()
            .then((client) => {
              if (!client) {
                sock.write(
                  JSON.stringify({
                    status: 404,
                    text: "클라이언트를 찾을 수 없습니다.",
                  }) + "\n"
                );
                return;
              }
              return db("rooms").where({ id: roomID }).first();
            })
            .then((room) => {
              if (!room) {
                sock.write(
                  JSON.stringify({
                    status: 404,
                    text: "방을 찾을 수 없습니다.",
                  }) + "\n"
                );
                return;
              }

              if (room["1p"] == null) {
                db("rooms")
                  .where({ id: roomID })
                  .update({ "1p": clientID, p_count: 1 })
                  .then(() =>
                    sock.write(
                      JSON.stringify({
                        status: 200,
                        text: "1p에 클라이언트 ID를 설정합니다.",
                      }) + "\n"
                    )
                  );
              } else if (room["2p"] == null) {
                db("rooms")
                  .where({ id: roomID })
                  .update({ "2p": clientID, p_count: 2 })
                  .then(() =>
                    sock.write(
                      JSON.stringify({
                        status: 200,
                        text: "2p에 클라이언트 ID를 설정합니다.",
                      }) + "\n"
                    )
                  );
              } else {
                sock.write(
                  JSON.stringify({ status: 403, text: "방이 가득 찼습니다." }) +
                    "\n"
                );
              }
            })
            .catch((err) => {
              console.error("데이터베이스 오류:", err);
              sock.write(
                JSON.stringify({ status: 500, text: "데이터베이스 오류" }) +
                  "\n"
              );
            });
          break;
        }

        case "/updateName": {
          const { clientID, name } = parsed;
          if (!clientID || !name) {
            sock.write(
              JSON.stringify({
                status: 400,
                text: "clientID와 name이 필요합니다.",
              }) + "\n"
            );
            break;
          }
          db("client")
            .where({ uid: clientID })
            .update({ name })
            .then(() => {
              sock.write(
                JSON.stringify({
                  status: 200,
                  text: "이름을 업데이트했습니다.",
                }) + "\n"
              );
            })
            .catch((err) => {
              console.error("데이터베이스 오류:", err);
              sock.write(
                JSON.stringify({ status: 500, text: "데이터베이스 오류" }) +
                  "\n"
              );
            });
          break;
        }

        case "/us": {
          // updateScore
          const { cl, sc } = parsed;
          if (!cl || sc == null) {
            sock.write(
              JSON.stringify({
                status: 400,
                text: "clientID와 score가 필요합니다.",
              }) + "\n"
            );
            break;
          }

          db("client")
            .where({ uid: cl })
            .first()
            .then((client) => {
              if (!client) {
                sock.write(
                  JSON.stringify({
                    status: 404,
                    text: "클라이언트를 찾을 수 없습니다.",
                  }) + "\n"
                );
                return;
              }
              console.log("클라이언트 정보:", client);
              // 현재 bestScore보다 높을 때만 업데이트
              if (client.bestScore === null || client.bestScore < sc) {
                return db("client")
                  .where({ uid: cl })
                  .update({ bestScore: sc })
                  .then(() => {
                    sock.write(
                      JSON.stringify({
                        status: 200,
                        text: "점수를 업데이트했습니다.",
                      }) + "\n"
                    );
                  });
              } else {
                sock.write(
                  JSON.stringify({
                    status: 200,
                    text: "최고 점수가 아니므로 업데이트하지 않습니다.",
                  }) + "\n"
                );
              }
            })
            .catch((err) => {
              console.error("데이터베이스 오류:", err);
              sock.write(
                JSON.stringify({ status: 500, text: "데이터베이스 오류" }) +
                  "\n"
              );
            });
          break;
        }

        case "/ping": {
          sock.write(JSON.stringify({ status: 200, text: "Pong!" }) + "\n");
          break;
        }

        case "/getRankings": {
          // client 테이블에서 bestScore가 높은 순서로 10개 가져와 uid만 반환
          db("client")
            .select("uid")
            .orderBy("bestScore", "desc")
            .limit(10)
            .then((rows) => {
              const ranking = rows.map((row) => row.uid);
              sock.write(
                JSON.stringify({
                  status: 200,
                  text: ranking.join(",") + ";",
                }) + "\n"
              );
            })
            .catch((err) => {
              console.error("데이터베이스 오류:", err);
              sock.write(
                JSON.stringify({ status: 500, text: "데이터베이스 오류" }) +
                  "\n"
              );
            });
          break;
        }

        case "/getClientInfo": {
          const { clientID } = parsed;
          if (!clientID) {
            sock.write(
              JSON.stringify({ status: 400, text: "clientID가 필요합니다." }) +
                "\n"
            );
            break;
          }
          db("client")
            .where({ uid: clientID })
            .first()
            .then((row) => {
              if (row) {
                sock.write(JSON.stringify({ ...row, status: 200 }) + "\n");
              } else {
                sock.write(
                  JSON.stringify({
                    status: 404,
                    text: "클라이언트를 찾을 수 없습니다.",
                  }) + "\n"
                );
              }
            })
            .catch((err) => {
              console.error("데이터베이스 오류:", err);
              sock.write(
                JSON.stringify({ status: 500, text: "데이터베이스 오류" }) +
                  "\n"
              );
            });
          break;
        }

        default:
          sock.write(
            JSON.stringify({ status: 404, text: "Unknown endpoint" }) + "\n"
          );
      }
    });

    sock.on("error", console.error);
    sock.on("close", () => {
      ipConnectionCount[ip] = Math.max(0, (ipConnectionCount[ip] || 1) - 1);
    });
  })
  .listen(PORT, HOST, () => console.log(`서버가 ${HOST}:${PORT}에서 시작되었습니다.`)
);
