describe("roomRepository", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRepository(configOverrides = {}) {
    const memory = {
      putRoom: jest.fn().mockResolvedValue("memory-put"),
      getRoom: jest.fn().mockResolvedValue("memory-room"),
      bindChildIfAllowed: jest.fn().mockResolvedValue("memory-bind"),
      appendMessage: jest.fn().mockResolvedValue("memory-append"),
      listMessages: jest.fn().mockResolvedValue("memory-list")
    };
    const dynamo = {
      putRoom: jest.fn().mockResolvedValue("dynamo-put"),
      getRoom: jest.fn().mockResolvedValue("dynamo-room"),
      bindChildIfAllowed: jest.fn().mockResolvedValue("dynamo-bind"),
      appendMessage: jest.fn().mockResolvedValue("dynamo-append"),
      listMessages: jest.fn().mockResolvedValue("dynamo-list")
    };

    jest.doMock("../../src/config", () => ({
      config: {
        roomStoreBackend: "auto",
        dynamoRoomsTable: "",
        dynamoMessagesTable: "",
        ...configOverrides
      }
    }));
    jest.doMock("../../src/services/roomMemoryRepository", () => memory);
    jest.doMock("../../src/services/roomDynamoRepository", () => dynamo);

    const repository = require("../../src/services/roomRepository");
    return { repository, memory, dynamo };
  }

  it("uses memory when explicitly configured", async () => {
    const { repository, memory, dynamo } = loadRepository({
      roomStoreBackend: "memory"
    });

    expect(repository.useDynamo()).toBe(false);
    await expect(repository.putRoom({ roomId: "1" })).resolves.toBe("memory-put");
    await expect(repository.getRoom("1")).resolves.toBe("memory-room");
    await expect(repository.bindChildIfAllowed("1", "child")).resolves.toBe("memory-bind");
    await expect(repository.appendMessage({ roomId: "1" })).resolves.toBe("memory-append");
    await expect(repository.listMessages("1", {})).resolves.toBe("memory-list");
    expect(repository.isPersistenceEnabled()).toBe(false);

    expect(memory.putRoom).toHaveBeenCalled();
    expect(dynamo.putRoom).not.toHaveBeenCalled();
  });

  it("uses dynamo when explicitly configured or tables are present", async () => {
    let loaded = loadRepository({
      roomStoreBackend: "dynamo"
    });

    expect(loaded.repository.useDynamo()).toBe(true);
    await expect(loaded.repository.putRoom({ roomId: "2" })).resolves.toBe("dynamo-put");
    expect(loaded.dynamo.putRoom).toHaveBeenCalled();

    jest.resetModules();
    loaded = loadRepository({
      roomStoreBackend: "auto",
      dynamoRoomsTable: "rooms-table",
      dynamoMessagesTable: "messages-table"
    });

    expect(loaded.repository.useDynamo()).toBe(true);
    expect(loaded.repository.isPersistenceEnabled()).toBe(true);
    await expect(loaded.repository.listMessages("2", {})).resolves.toBe("dynamo-list");
  });
});
