import "server-only";
import type { LineMessenger } from "@/application/host-line/host-line.types";
import { getProfileName, lineConfig, pushMessage, replyMessage } from "./line-client";
import { inviteLinksMessage, replies } from "./messages";

export const lineMessenger: LineMessenger = {
  configured: lineConfig,
  displayName: getProfileName,
  pushTest: (userId, hostName) => pushMessage(userId, [replies.test(hostName)]),
  replyWelcome: (token) => replyMessage(token, [replies.welcome("")]),
  replyLinked: (token, hostName, moved) =>
    replyMessage(token, moved ? [replies.alreadyLinkedOther(), replies.linked(hostName)] : [replies.linked(hostName)]),
  replyBadCode: (token) => replyMessage(token, [replies.badCode()]),
  replyHelp: (token) => replyMessage(token, [replies.help()]),
  replyInviteLinks: (token, links) => replyMessage(token, [inviteLinksMessage(links)]),
  replyInviteNotLinked: (token) => replyMessage(token, [replies.inviteNotLinked()]),
};
