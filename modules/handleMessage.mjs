import { logDebug, log, err } from './utils.mjs';
import { hasPermissions, isWhisper, hasPrefix, isPartyInvite, isPartyMessage } from './boolChecks.mjs';
import { runPartyCommand } from './handleCommand.mjs';
import { partyBot } from '../index.mjs';
import { replyUsage } from './sharedCoreFunctionality.mjs';
import { allowlist, partyHostNameWithoutRank } from './manageData.mjs';


import kickableData from "../data/autoKickWords.json" with { type: "json" };
const autoKickWords = kickableData.autoKickWords;
// TODO: if this system ever causes any big unforeseen issues, just insert/use this instead:
// const autoKickWords = ["sakldhjldsahjabfsfhkfahkjasfhj-thiswillneverbematched"];


export { parseAndExecuteMessage };

/**
 * Core of the bot listener, managing all incoming messages.
 * @param {ChatMessage} message
 */
function parseAndExecuteMessage(message) {
  let parsedMsgObj = extractMessage(message);

  if (parsedMsgObj == '') {
    /* Without this check, there'd be a crash upon entering "/pl" via console
    stdin due to the blank lines in the output (list of party members), meaning
    the root cause here is me reusing the function meant for Mineflayer text
    "objects" (which are not a basic string) for the commands sent from stdin,
    i.e. ones that were not even originating in-game. Thus the non type-strict
    comparison is correct. */
    // Replace empty lines with a single space to make life easier
    parsedMsgObj = ' ';
  }

  //logDebug("parsedMsgObj: '" + parsedMsgObj + "'");

  const { rank, playerName, msgContent } = parseMessage(parsedMsgObj);

  /* Here we save the (more expensive) access to allowlist data by checking for
  permissions only within the respective cases below instead of every time now
  already – as nearly all messages in this listener will _not_ be a command nor
  invite (by an allowed person no less) */


  // too spammy & most often not even needed yet for general debugging
  //logDebug("At parseAndExecuteMessage(), message is not yet checked to be a whisper, with the following:");
  //logDebug("rank: '" + rank + "'");
  //logDebug("playerName: '" + playerName + "'");
  //logDebug("msgContent: '" + msgContent + "'");


  switch (determineMessageType(parsedMsgObj)) {
    case "whisper":
      handleWhisper(rank, playerName, msgContent, parsedMsgObj);
      break;
    case "partyInvite":
      handlePartyInvite(rank, playerName, msgContent, parsedMsgObj);
      break;
    case "partyMessage":
      // for autoKickWords functionality
      handlePartyMessage(rank, playerName, msgContent, parsedMsgObj);
      break;
    default:
      // do nothing
      // spammy:
      // logDebug("Message is neither whisper (dm) nor a party message or invite");
      break;
  }
}



/**
 * Extracts message from a humongous ChatMessage Object (why hypixel)
 * @param {ChatMessage} chatMessage
 * @returns {string} Message but as string.
 */
function extractMessage(chatMessage) {
  let message = (chatMessage.text || chatMessage) || '';
  // extremely spammy:
  //logDebug("extractMessage's chatMessage: '" + chatMessage + "'");
  //logDebug("extractMessage's message: '" + message + "'");

  if (Array.isArray(chatMessage.extra)) {
    for (const extraMessage of chatMessage.extra) {
      if (extraMessage && typeof extraMessage === 'object') {
        message += extractMessage(extraMessage);
      }
    }
  }

  return message;
}


/**
 *
 * @param {*} parsedMsgObj
 * @returns String of message type – either `whisper`, `partyInvite`, `partyMessage`, or `unknown`
 */
function determineMessageType(parsedMsgObj) {
  if (isWhisper(parsedMsgObj)) return "whisper";
  else if (isPartyInvite(parsedMsgObj).isPartyInvite) return "partyInvite";
  else if (isPartyMessage(parsedMsgObj)) return "partyMessage";
  else return "unknown";
}


/**
 * Parses messages into sender and message content parts, where messages may be
 * sent directly or to party chat (prefixes `From `, `Party > `, etc.)
 * @param {string} msg
 * @returns {{rank: string,
*           playerName: string,
*           msgContent: string}} Player data as well as message content.
*/
function parseMessage(msg, type) {
  const rankRegex = /\[([A-Za-z]).*\]/;
  const colonIndex = (msg == null) ? -1 : msg.indexOf(':');

  // Get content from start to first instance of a colon.
  const fromMsg = (colonIndex !== -1) ? msg.slice(0, colonIndex).trim() : msg;
  // Get message content.
  const msgContent = (colonIndex !== -1) ? msg.slice(colonIndex + 1).trim() : '';

  // Apply regular expression to find if the user has a rank.
  const rankMatch = fromMsg.match(rankRegex);
  // If user has rank, take first index, otherwise no rank.
  const rank = rankMatch ? rankMatch[0] : '';

  // Get only username, determine message type (e.g. direct or party message) for Regex
  let messageChannelPrefix; // = channelPrefixes[type];
  if (isWhisper(msg)) messageChannelPrefix = "From ";
  else if (isPartyMessage(msg)) messageChannelPrefix = "Party > ";

  const playerName = fromMsg.replace(rankRegex, '').trim().replace(new RegExp('^' + messageChannelPrefix), '').trim();

  if (determineMessageType(msg) != "unknown") {
    // TODO: remove temporary solution (this determineMessageType() call) which
    // prevents log spamminess – after the debug "verbosity" levels have been added
    logDebug("rank, senderName, msgContent: '" + rank + "', '" + playerName + "', '" + msgContent + "'");
  }

  return {rank,
          playerName,
          msgContent}
}


function handleWhisper(rank, playerName, msgContent, parsedMsgObj) {
  logDebug("Message is whisper");

  // also TODO: rename playerName to senderName ?!?!
  // const { rank, playerName, msgContent } = parseWhisper(parsedMsgObj);



  if (!hasPrefix(msgContent, partyBot.b_prefix)) {
    if (msgContent.includes("help")) { // e.g. `!help` instead of `!p help`
      replyUsage(playerName);
    }
    return;
  }
  logDebug("Message has prefix");
  // This is basically what equals an `if isSplasher(sender)`
  const permissionsCheck = hasPermissions(playerName, allowlist);
  if (!permissionsCheck[0]) return;
  const args = msgContent.replace(partyBot.b_prefix, '').trim().split(" ")
  const data = {
    playerName: playerName,
    formattedPlayerName: `${rank} ${playerName}`,
    rank: rank,
    message: msgContent,
    b_prefix: partyBot.b_prefix,
    primaryName: permissionsCheck[1]
  }
  const [command, ...cmdArgs] = args;
  logDebug("data.playerName, primaryName, command, cmdArgs:")
  logDebug("'" + data.playerName + "', '" + data.primaryName + "', '" + command + "', '" + cmdArgs + "'");
  log("Executing command: '" + command + "' with args: '" + cmdArgs + "'");
  runPartyCommand(data, command, cmdArgs);
  return;
}


function handlePartyInvite(rank, playerName, msgContent, parsedMsgObj) {
  // TODO: optimize this and the other isPartyInvite call, (by splitting the function up) somehow?
  const result = isPartyInvite(parsedMsgObj);
  // different player name & format than given from parseWhisper() above:
  const invitingPlayerName = result.senderName;
  // This is basically what equals an `if isSplasher(sender)`
  const permissionsCheck = hasPermissions(invitingPlayerName, allowlist);
  if (!permissionsCheck[0]) return;
  const command = "party accept " + invitingPlayerName;
  logDebug(`Sender Name: '${invitingPlayerName}'`);
  logDebug("result.isPartyInvite='" + result.isPartyInvite + "'");
  logDebug("bot: '" + partyBot.name + "'");
  logDebug("command: '" + command + "'");
  // there is no harm in accepting an invite while already currently being
  // leader of a party, so to simplify, we don't check for that
  partyBot.runCommand(command);
  return;
}


function handlePartyMessage(rank, playerName, msgContent, parsedMsgObj) {
  // TMP! maybe rework this – we only need msgContent & playerName here
  //const { rank, playerName, msgContent } = parsePartyMessage(parsedMsgObj);

  //if (!autoKickWords.contains(msgContent.trim().split(" "))) {
  //if (!msgContent.trim().split(" ").contains())

  if (!autoKickWords.some(value => msgContent.trim().split(" ").includes(value))) {
    logDebug("No auto-kickable phrase detected");
    return;
  }
  logDebug(autoKickWords);
  // default, immediate punishment for spammers: kick from party;
  // blocking can/has to be decided and ran manually
  const command = "party kick " + playerName;
  // Party leader (the bot account) can't kick p leader (ex. misused !p say)
  if (playerName != partyHostNameWithoutRank) {
    log(`Kicked ${playerName} because of autoKickWords rule`);
    partyBot.runCommand(command);
  } else {
    log("Someone, presumably splasher, used an auto-kick word");
  }
}

