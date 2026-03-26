const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand
} = require("@aws-sdk/lib-dynamodb");
const { config } = require("../config");

let docClient;

function getDocClient() {
  if (!docClient) {
    const region = config.cognitoRegion || process.env.AWS_REGION || "us-east-1";
    const client = new DynamoDBClient({ region });
    docClient = DynamoDBDocumentClient.from(client);
  }
  return docClient;
}

async function putRoom(room) {
  await getDocClient().send(
    new PutCommand({
      TableName: config.dynamoRoomsTable,
      Item: {
        roomId: room.roomId,
        parentUserId: room.parentUserId,
        childUserId: room.childUserId ?? null,
        status: room.status,
        passwordHash: room.passwordHash ?? null,
        createdAt: room.createdAt
      },
      ConditionExpression: "attribute_not_exists(roomId)"
    })
  );
}

async function getRoom(roomId) {
  const out = await getDocClient().send(
    new GetCommand({
      TableName: config.dynamoRoomsTable,
      Key: { roomId }
    })
  );
  return out.Item || null;
}

async function bindChildIfAllowed(roomId, childUserId) {
  try {
    await getDocClient().send(
      new UpdateCommand({
        TableName: config.dynamoRoomsTable,
        Key: { roomId },
        UpdateExpression: "SET childUserId = :c, #st = :s",
        ExpressionAttributeNames: { "#st": "status" },
        ExpressionAttributeValues: {
          ":c": childUserId,
          ":s": "BOUND",
          ":uid": childUserId
        },
        ConditionExpression: "attribute_not_exists(childUserId) OR childUserId = :uid"
      })
    );
    return { ok: true };
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException") {
      return { ok: false, code: "CHILD_SLOT_TAKEN" };
    }
    throw e;
  }
}

async function appendMessage({ roomId, sortKey, senderId, senderRole, nickname, text, createdAt }) {
  await getDocClient().send(
    new PutCommand({
      TableName: config.dynamoMessagesTable,
      Item: {
        roomId,
        sortKey,
        senderId,
        senderRole,
        nickname,
        text,
        createdAt
      }
    })
  );
  return { roomId, sortKey, senderId, senderRole, nickname, text, createdAt };
}

async function listMessages(roomId, { limit = 100, startAfter } = {}) {
  const params = {
    TableName: config.dynamoMessagesTable,
    KeyConditionExpression: "roomId = :r",
    ExpressionAttributeValues: { ":r": roomId },
    Limit: limit,
    ScanIndexForward: false
  };
  if (startAfter) {
    params.ExclusiveStartKey = { roomId, sortKey: startAfter };
  }
  const out = await getDocClient().send(new QueryCommand(params));
  const items = (out.Items || [])
    .reverse()
    .map((i) => ({
      roomId: i.roomId,
      sortKey: i.sortKey,
      senderId: i.senderId,
      senderRole: i.senderRole,
      nickname: i.nickname,
      text: i.text,
      createdAt: i.createdAt
    }));
  const lastKey = out.LastEvaluatedKey ? out.LastEvaluatedKey.sortKey : null;
  return { items, lastKey };
}

module.exports = {
  putRoom,
  getRoom,
  bindChildIfAllowed,
  appendMessage,
  listMessages
};
