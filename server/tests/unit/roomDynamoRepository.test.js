describe("roomDynamoRepository", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRepository(configOverrides = {}) {
    const send = jest.fn();
    const DynamoDBClient = jest.fn(function DynamoDBClient(options) {
      this.options = options;
    });
    const from = jest.fn(() => ({ send }));

    function commandMock(name) {
      return jest.fn(function Command(input) {
        this.input = input;
        this.name = name;
      });
    }

    const PutCommand = commandMock("PutCommand");
    const GetCommand = commandMock("GetCommand");
    const UpdateCommand = commandMock("UpdateCommand");
    const QueryCommand = commandMock("QueryCommand");

    jest.doMock("../../src/config", () => ({
      config: {
        cognitoRegion: "us-east-2",
        dynamoRoomsTable: "rooms-table",
        dynamoMessagesTable: "messages-table",
        ...configOverrides
      }
    }));
    jest.doMock("@aws-sdk/client-dynamodb", () => ({
      DynamoDBClient
    }));
    jest.doMock("@aws-sdk/lib-dynamodb", () => ({
      DynamoDBDocumentClient: { from },
      GetCommand,
      PutCommand,
      UpdateCommand,
      QueryCommand
    }));

    const repository = require("../../src/services/roomDynamoRepository");
    return {
      repository,
      send,
      DynamoDBClient,
      from,
      PutCommand,
      GetCommand,
      UpdateCommand,
      QueryCommand
    };
  }

  it("stores and retrieves rooms via DynamoDB commands", async () => {
    const loaded = loadRepository();
    loaded.send.mockResolvedValueOnce({});
    loaded.send.mockResolvedValueOnce({ Item: { roomId: "1234" } });

    await loaded.repository.putRoom({
      roomId: "1234",
      parentUserId: "parent-1",
      childUserId: "child-1",
      passwordHash: "hashed",
      status: "BOUND",
      createdAt: 1
    });
    const room = await loaded.repository.getRoom("1234");

    expect(room).toEqual({ roomId: "1234" });
    expect(loaded.DynamoDBClient).toHaveBeenCalledWith({ region: "us-east-2" });
    expect(loaded.from).toHaveBeenCalledTimes(1);
    expect(loaded.PutCommand.mock.instances[0].input).toMatchObject({
      TableName: "rooms-table",
      ConditionExpression: "attribute_not_exists(roomId)"
    });
    expect(loaded.GetCommand.mock.instances[0].input).toEqual({
      TableName: "rooms-table",
      Key: { roomId: "1234" }
    });
  });

  it("binds children, appends messages, and paginates history", async () => {
    const loaded = loadRepository();
    loaded.send.mockResolvedValueOnce({});
    loaded.send.mockResolvedValueOnce({});
    loaded.send.mockResolvedValueOnce({
      Items: [
        {
          roomId: "1234",
          sortKey: "002",
          senderId: "p2",
          senderRole: "child",
          nickname: "Kid",
          text: "later",
          createdAt: 2
        },
        {
          roomId: "1234",
          sortKey: "001",
          senderId: "p1",
          senderRole: "parent",
          nickname: "Dad",
          text: "first",
          createdAt: 1
        }
      ],
      LastEvaluatedKey: { roomId: "1234", sortKey: "002" }
    });

    await expect(loaded.repository.bindChildIfAllowed("1234", "child-1")).resolves.toEqual({ ok: true });
    await expect(
      loaded.repository.appendMessage({
        roomId: "1234",
        sortKey: "003",
        senderId: "p3",
        senderRole: "parent",
        nickname: "Mom",
        text: "hello",
        createdAt: 3
      })
    ).resolves.toMatchObject({ text: "hello" });

    const history = await loaded.repository.listMessages("1234", {
      limit: 2,
      startAfter: "001"
    });

    expect(loaded.UpdateCommand.mock.instances[0].input.ConditionExpression).toContain("attribute_not_exists");
    expect(loaded.QueryCommand.mock.instances[0].input).toEqual({
      TableName: "messages-table",
      KeyConditionExpression: "roomId = :r",
      ExpressionAttributeValues: { ":r": "1234" },
      Limit: 2,
      ScanIndexForward: false,
      ExclusiveStartKey: { roomId: "1234", sortKey: "001" }
    });
    expect(history).toEqual({
      items: [
        {
          roomId: "1234",
          sortKey: "001",
          senderId: "p1",
          senderRole: "parent",
          nickname: "Dad",
          text: "first",
          createdAt: 1
        },
        {
          roomId: "1234",
          sortKey: "002",
          senderId: "p2",
          senderRole: "child",
          nickname: "Kid",
          text: "later",
          createdAt: 2
        }
      ],
      lastKey: "002"
    });
  });

  it("maps conditional child bind failures", async () => {
    const loaded = loadRepository();
    loaded.send.mockRejectedValueOnce(
      Object.assign(new Error("taken"), { name: "ConditionalCheckFailedException" })
    );

    await expect(loaded.repository.bindChildIfAllowed("1234", "child-2")).resolves.toEqual({
      ok: false,
      code: "CHILD_SLOT_TAKEN"
    });
  });
});
