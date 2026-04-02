jest.mock("../src/config", () => ({
  config: {
    authMode: "cognito",
    cognitoRegion: "us-east-2",
    cognitoUserPoolId: "pool",
    cognitoAppClientId: "client",
    cognitoIssuer: "https://cognito-idp.us-east-2.amazonaws.com/pool",
    dynamoRoomsTable: "",
    dynamoMessagesTable: "",
    roomStoreBackend: "memory"
  }
}));

const roomMemoryRepository = require("../src/services/roomMemoryRepository");
const roomService = require("../src/services/roomService");

describe("roomService (memory store)", () => {
  beforeEach(() => {
    roomMemoryRepository.clearForTests();
  });

  it("creates a room for parent", async () => {
    const r = await roomService.createRoomForParent({
      parentUserId: "parent-1",
      passwordPlain: undefined
    });
    expect(r.ok).toBe(true);
    expect(r.roomId).toMatch(/^\d{4}$/);
  });

  it("treats empty password string as no password", async () => {
    const r = await roomService.createRoomForParent({
      parentUserId: "parent-empty-pw",
      passwordPlain: ""
    });
    expect(r.ok).toBe(true);
    const meta = await roomService.getRoomMeta(r.roomId);
    expect(meta.requiresPassword).toBe(false);
  });

  it("hashes non-empty room passwords before storing", async () => {
    const r = await roomService.createRoomForParent({
      parentUserId: "parent-secret",
      passwordPlain: "secret123"
    });

    const storedRoom = await roomMemoryRepository.getRoom(r.roomId);

    expect(storedRoom.passwordHash).toBeTruthy();
    expect(storedRoom.passwordHash).not.toBe("secret123");
  });

  it("allows parent to access own room", async () => {
    const { roomId } = await roomService.createRoomForParent({
      parentUserId: "p1",
      passwordPlain: "secret1"
    });
    const v = await roomService.validateRoomAccess({
      roomId,
      userId: "p1",
      role: "parent",
      passwordPlain: null
    });
    expect(v.ok).toBe(true);
  });

  it("returns NOT_FOUND for missing room", async () => {
    const v = await roomService.validateRoomAccess({
      roomId: "9999",
      userId: "u",
      role: "parent",
      passwordPlain: null
    });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(404);
    expect(v.code).toBe("NOT_FOUND");
  });

  it("returns NOT_ROOM_PARENT when another user tries as parent", async () => {
    const { roomId } = await roomService.createRoomForParent({
      parentUserId: "real-parent",
      passwordPlain: undefined
    });
    const v = await roomService.validateRoomAccess({
      roomId,
      userId: "other-parent",
      role: "parent",
      passwordPlain: null
    });
    expect(v.ok).toBe(false);
    expect(v.code).toBe("NOT_ROOM_PARENT");
    expect(v.status).toBe(403);
  });

  it("returns BAD_PASSWORD when child has wrong password", async () => {
    const { roomId } = await roomService.createRoomForParent({
      parentUserId: "p-pw",
      passwordPlain: "correct"
    });
    const v = await roomService.validateRoomAccess({
      roomId,
      userId: "kid1",
      role: "child",
      passwordPlain: "wrong"
    });
    expect(v.ok).toBe(false);
    expect(v.code).toBe("BAD_PASSWORD");
    expect(v.status).toBe(401);
  });

  it("binds first child and rejects second child", async () => {
    const { roomId } = await roomService.createRoomForParent({
      parentUserId: "p2",
      passwordPlain: "pw"
    });
    const c1 = await roomService.validateRoomAccess({
      roomId,
      userId: "c-a",
      role: "child",
      passwordPlain: "pw"
    });
    expect(c1.ok).toBe(true);

    const c2 = await roomService.validateRoomAccess({
      roomId,
      userId: "c-b",
      role: "child",
      passwordPlain: "pw"
    });
    expect(c2.ok).toBe(false);
    expect(c2.code).toBe("ROOM_FULL");
  });

  it("allows bound child to rejoin without password", async () => {
    const { roomId } = await roomService.createRoomForParent({
      parentUserId: "p-re",
      passwordPlain: "door"
    });
    await roomService.validateRoomAccess({
      roomId,
      userId: "kid-same",
      role: "child",
      passwordPlain: "door"
    });
    const again = await roomService.validateRoomAccess({
      roomId,
      userId: "kid-same",
      role: "child",
      passwordPlain: null
    });
    expect(again.ok).toBe(true);
  });

  it("rejects parent sub trying to enter as child", async () => {
    const { roomId } = await roomService.createRoomForParent({
      parentUserId: "parent-sub",
      passwordPlain: undefined
    });
    const v = await roomService.validateRoomAccess({
      roomId,
      userId: "parent-sub",
      role: "child",
      passwordPlain: null
    });
    expect(v.ok).toBe(false);
    expect(v.code).toBe("BAD_ROLE");
  });

  it("returns BAD_ROLE for unknown role string", async () => {
    const { roomId } = await roomService.createRoomForParent({
      parentUserId: "p-role",
      passwordPlain: undefined
    });
    const v = await roomService.validateRoomAccess({
      roomId,
      userId: "x",
      role: "teacher",
      passwordPlain: null
    });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(400);
    expect(v.code).toBe("BAD_ROLE");
  });

  it("getRoomMeta reflects password and child presence", async () => {
    const { roomId: withPw } = await roomService.createRoomForParent({
      parentUserId: "pm1",
      passwordPlain: "x"
    });
    const meta1 = await roomService.getRoomMeta(withPw);
    expect(meta1.exists).toBe(true);
    expect(meta1.requiresPassword).toBe(true);
    expect(meta1.hasChild).toBe(false);

    const { roomId: noPw } = await roomService.createRoomForParent({
      parentUserId: "pm2",
      passwordPlain: undefined
    });
    const meta2 = await roomService.getRoomMeta(noPw);
    expect(meta2.requiresPassword).toBe(false);

    await roomService.validateRoomAccess({
      roomId: noPw,
      userId: "kid-meta",
      role: "child",
      passwordPlain: null
    });
    const meta3 = await roomService.getRoomMeta(noPw);
    expect(meta3.hasChild).toBe(true);
    expect(meta3.status).toBe("BOUND");
  });

  it("getRoomMeta for missing room returns exists false", async () => {
    const meta = await roomService.getRoomMeta("0000");
    expect(meta.exists).toBe(false);
    expect(meta.status).toBe(null);
  });

  it("persists chat messages", async () => {
    const { roomId } = await roomService.createRoomForParent({
      parentUserId: "p3",
      passwordPlain: undefined
    });
    await roomService.appendChatMessage({
      roomId,
      senderId: "p3",
      senderRole: "parent",
      nickname: "Dad",
      text: "hi"
    });
    const { items } = await roomService.getMessages(roomId, { limit: 10 });
    expect(items.length).toBe(1);
    expect(items[0].text).toBe("hi");
    expect(items[0].senderRole).toBe("parent");
  });

  it("stores multiple messages in order", async () => {
    const { roomId } = await roomService.createRoomForParent({
      parentUserId: "p-multi",
      passwordPlain: undefined
    });
    await roomService.appendChatMessage({
      roomId,
      senderId: "p-multi",
      senderRole: "parent",
      nickname: "P",
      text: "a"
    });
    await roomService.appendChatMessage({
      roomId,
      senderId: "p-multi",
      senderRole: "parent",
      nickname: "P",
      text: "b"
    });
    const { items } = await roomService.getMessages(roomId, { limit: 10 });
    expect(items.map((m) => m.text).join(",")).toBe("a,b");
  });

  it("returns only the latest messages when limit is smaller than history", async () => {
    const { roomId } = await roomService.createRoomForParent({
      parentUserId: "p-limit",
      passwordPlain: undefined
    });

    await roomService.appendChatMessage({
      roomId,
      senderId: "p-limit",
      senderRole: "parent",
      nickname: "P",
      text: "a"
    });
    await roomService.appendChatMessage({
      roomId,
      senderId: "p-limit",
      senderRole: "parent",
      nickname: "P",
      text: "b"
    });
    await roomService.appendChatMessage({
      roomId,
      senderId: "p-limit",
      senderRole: "parent",
      nickname: "P",
      text: "c"
    });

    const { items } = await roomService.getMessages(roomId, { limit: 2 });

    expect(items.map((message) => message.text)).toEqual(["b", "c"]);
  });

  it("supports pagination with startAfter sort key", async () => {
    const { roomId } = await roomService.createRoomForParent({
      parentUserId: "p-page",
      passwordPlain: undefined
    });

    const first = await roomService.appendChatMessage({
      roomId,
      senderId: "p-page",
      senderRole: "parent",
      nickname: "P",
      text: "first"
    });
    await roomService.appendChatMessage({
      roomId,
      senderId: "p-page",
      senderRole: "parent",
      nickname: "P",
      text: "second"
    });
    await roomService.appendChatMessage({
      roomId,
      senderId: "p-page",
      senderRole: "parent",
      nickname: "P",
      text: "third"
    });

    const { items } = await roomService.getMessages(roomId, {
      limit: 10,
      startAfter: first.sortKey
    });

    expect(items.map((message) => message.text)).toEqual(["second", "third"]);
  });
});
