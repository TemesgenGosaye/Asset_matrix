/**
 * Amharic (አማርኛ) translations.
 *
 * Scope is deliberate. The shared feedback system (`lib/feedback`) is fully
 * translated here because it is the surface an operator reads mid-task, in a
 * hurry, often in the same breath as the Amharic on a printed form. The rest of
 * the key space translates the application chrome a user meets on every page
 * (navigation, actions, statuses, common labels, table headers).
 *
 * Any key missing here falls back to English rather than rendering its own key:
 * `t()` resolves locale → English → key. A missing translation therefore reads
 * as English, which is wrong but legible; a raw `feedback.x.y` would read as
 * broken.
 */
const am: Record<string, string> = {
  // ── Navigation ────────────────────────────────────────────────────────────
  "nav.dashboard": "ዳሽቦርድ",
  "nav.assets": "ንብረቶች",
  "nav.users": "ተጠቃሚዎች",
  "nav.consumables": "የሚጠቅሙ ንብረቶች",
  "nav.accessories": "ማስተሻሻያዎች",
  "nav.licences": "ፈቃዶች",
  "nav.manufacturers": "አስተማጭነያዎች",
  "nav.suppliers": "አቅራቢዎች",
  "nav.locations": "አካባቢዎች",
  "nav.assetCategories": "የንብረት ዘርፎች",
  "nav.accessoryCategories": "የማስተሻሻያ ዘርፎች",
  "nav.consumableCategories": "የሚጠቅሙ ዘርፎች",
  "nav.licenceCategories": "የፈቃድ ዘርፎች",
  "nav.models": "ሞዴሎች",
  "nav.statusTypes": "የሁኔታ ዘርፎች",
  "nav.tickets": "የመሣሪያ ጥያቄዎች",
  "nav.approvals": "ማጽደቅዎች",
  "nav.qrScanner": "QR ስካነር",
  "nav.reports": "መዝገቦች",
  "nav.workflows": "የሥራ ፍሰቶች",
  "nav.auditLogs": "የምርመራ መዝገቦች",
  "nav.gdpr": "GDPR",
  "nav.compliance": "ተጠያቂነት",
  "nav.adminSettings": "የአስተዳዳሪ ቅንብሮች",
  "nav.components": "ክፍሎች",
  "nav.componentCategories": "የክፍል ዘርፎች",
  "nav.kits": "ቅጾች",
  "nav.audits": "ኦዲቶች",

  "nav.section.overview": "አጠቃላይ እይታ",
  "nav.section.inventory": "የንብረት መዝገብ",
  "nav.section.categories": "ዘርፎች",
  "nav.section.tools": "መሳሪያዎች",
  "nav.section.administration": "አስተዳደር",

  // ── Actions ───────────────────────────────────────────────────────────────
  "action.create": "ፍጠር",
  "action.edit": "አርትዕ",
  "action.delete": "አጥፋ",
  "action.save": "አስቀምጥ",
  "action.cancel": "ሰርዝ",
  "action.search": "ፈልግ",
  "action.filter": "አጣራ",
  "action.export": "አላሀድ",
  "action.import": "አምጣ",
  "action.submit": "አስገባ",
  "action.reset": "ዳግም አስጀምር",
  "action.back": "ተመለስ",
  "action.next": "ቀጣይ",
  "action.previous": "ያለፈው",
  "action.close": "ዝጋ",
  "action.refresh": "አድስ",
  "action.download": "አውርድ",
  "action.upload": "ጫን",
  "action.view": "ተመልከት",
  "action.print": "አትም",
  "action.copy": "ቅዳ",
  "action.duplicate": "ቅጂ",
  "action.archive": "አርክቭ",
  "action.restore": "አካንስ",

  // ── Status ────────────────────────────────────────────────────────────────
  "status.active": "ነቃሽ",
  "status.inactive": "ያልነቃ",
  "status.available": "ዝግጁ",
  "status.retired": "ወጥ",
  "status.pending": "በመጠባበቅ ላይ",
  "status.approved": "ጸድቋ",
  "status.rejected": "ውድቅ",
  "status.deployed": "ተላክቷል",
  "status.inRepair": "በእንክት ላይ",
  "status.lost": "ጠፋ",
  "status.damaged": "ተጎዳ",
  "status.checkedOut": "ወጥ",
  "status.checkedIn": "መልሷል",

  // ── Common ────────────────────────────────────────────────────────────────
  "common.loading": "በመጫን ላይ",
  "common.error": "ስህተት",
  "common.noResults": "ውጤት የለም",
  "common.confirm": "አረጋግጥ",
  "common.areYouSure": "እርግዚዎ?",
  "common.yes": "አዎ",
  "common.no": "አይ",
  "common.ok": "እሺ",
  "common.all": "ሁሉም",
  "common.none": "ምንም",
  "common.selected": "የተመረጠ",
  "common.total": "ጠቅላላ",
  "common.showing": "በማሳደጥ",
  "common.of": "ከ",
  "common.page": "ገጽ",
  "common.perPage": "በገጽ",
  "common.sortBy": "በመደበኛ",
  "common.ascending": "ወላ ላይ",
  "common.descending": "ወር ታች",
  "common.quickActions": "ፈጣን እርምጃዎች",
  "common.requiredField": "ይህ መስክ ያስፈልጋል",
  "common.noData": "መረጃ ዝግጁ የለም",
  "common.tryAgain": "እንደገና ሞክር",

  // ── Feedback — shared operation feedback ──────────────────────────────────
  // Every toast title and description in the app resolves through this
  // namespace, so the wording for an operation is decided in exactly one place
  // and exists in both languages.

  "feedback.created.title": "ተፈጥሯል",
  "feedback.created.description": "{{entity}} ተፈጥሯል።",
  "feedback.updated.title": "ተዘምኗል",
  "feedback.updated.description": "{{entity}} ተዘምኗል።",
  "feedback.deleted.title": "ተጥፋል",
  "feedback.deleted.description": "{{entity}} ተጥፋል።",
  "feedback.saved.title": "ተቀምጧል",
  "feedback.saved.description": "{{entity}} ተቀምጧል።",

  "feedback.approved.title": "ጸድቋል",
  "feedback.approved.description": "{{entity}} ጸድቋል።",
  "feedback.released.title": "ተለቅቷል",
  "feedback.released.description": "{{entity}} ተለቅቷል።",
  "feedback.skipped.title": "ዝለለፍ ተደርጓል",
  "feedback.skipped.description": "{{entity}} ከቅጽ ዝለልቷል።",
  "feedback.deferred.title": "ተሸጋግሯል",
  "feedback.deferred.description": "{{entity}} ወደ ሌላ ጊዜ ተሸጋግሯል።",

  "feedback.imported.title": "ተገብሯል",
  "feedback.imported.description": "{{count}} ልክ መረጃ ተገብሯል።",
  "feedback.exported.title": "ተላክቷል",
  "feedback.exported.description": "{{entity}} ተላክቷል።",
  "feedback.uploaded.title": "ተጭኗል",
  "feedback.uploaded.description": "{{file}} ተጭኗል።",
  "feedback.sent.title": "ተልኳል",
  "feedback.sent.description": "{{entity}} ተልኳል።",

  "feedback.assigned.title": "ተመድቧል",
  "feedback.assigned.description": "{{entity}} ለ {{assignee}} ተመድቧል።",
  "feedback.returned.title": "ተመልሷል",
  "feedback.returned.description": "{{entity}} ተመልሷል።",

  "feedback.passwordChanged.title": "የይለፍ ቃል ተቀይሯል",
  "feedback.passwordChanged.description": "የይለፍ ቃል በተሳካነት ተቀይሯል።",
  "feedback.settingsSaved.title": "ቅንብሮች ተቀምጠዋል",
  "feedback.settingsSaved.description": "የ{{section}} ቅንብሮች ተቀምጠዋል።",
  "feedback.loginSuccess.title": "ግባ ተሳክቷል",
  "feedback.loginSuccess.description": "እንኳን ደህና መጡ {{name}}።",

  // ── Feedback — House Queue ────────────────────────────────────────────────
  "feedback.allocationApproved.title": "የቤት ምደባ ተጸድቷል",
  "feedback.allocationApproved.description":
    "{{name}} ({{employeeNumber}}) ቤት {{houseNumber}} ላይ ተመድቧል።",
  "feedback.allocationReassigned.title": "የቤት ምደባ ተቀይሯል",
  "feedback.allocationReassigned.description":
    "{{name}} ({{employeeNumber}}) ወደ ቤት {{houseNumber}} ተላክቷል።",
  "feedback.allocationApprovedMeta.rank": "ደረጃ #{{rank}}",
  "feedback.allocationApprovedMeta.score": "ውጤት {{score}}",
  "feedback.allocationApprovedAction": "ምደባውን ተመልከት",

  "feedback.releaseInitiated.title": "የማስተዋወጫ ሂደት ተጀመረ",
  "feedback.releaseInitiated.description":
    "{{name}} ({{employeeNumber}}) ለ{{branch}} ተመድቧል።",
  "feedback.releaseExecuted.title": "ቤቱ ተለቅቷል",
  "feedback.releaseExecuted.description":
    "{{name}} ({{employeeNumber}}) ከቤት {{houseNumber}} ወጥ ተውጣል። የቤት መመለስ ፍለጋ ተከፍቷል።",
  "feedback.releaseExecutedMeta.inspection": "ፍለጋ {{date}}",
  "feedback.releaseExecutedMeta.house": "ቤት {{houseNumber}}",
  "feedback.releaseExecutedAction": "ፍለጋውን ክፈት",
  "feedback.transferStarted.title": "የቤት ማስተዋወጫ ተጀመረ",
  "feedback.transferStarted.description":
    "{{name}} ({{employeeNumber}}) ወደ አዲስ ቤት {{houseNumber}} ይላካል።",

  "feedback.inspectionCompleted.title": "ፍለጋ ተጠናቋል",
  "feedback.inspectionCompleted.description": "ፍለጋው ተጠናቋል፤ የቤት ማስተዋወጫ ተጠናቋል።",
  "feedback.branch.transfer": "ማስተዋወጫ",
  "feedback.branch.leave": "ከድርጅቱ መውገድ",
  "feedback.branch.retirement": "ገደራ",

  // ── Feedback — failures ───────────────────────────────────────────────────
  "feedback.error.title": "አልተሳካም",
  "feedback.error.description": "{{message}}",
  "feedback.warning.title": "ስጠንቀቅ",
  "feedback.warning.description": "{{message}}",
  "feedback.info.title": "መረጃ",
  "feedback.info.description": "{{message}}",
  "feedback.networkError.title": "ከአገልጋይ ጋር መገናኘት አልተቻለም",
  "feedback.networkError.description": "ጥያቄው ከዚህ መሣሪያ ወጭ አልወጣም። ምንም አልተቀመጠም።",
  "feedback.dismiss": "ዝጋ",
  "feedback.dismissLabel": "ማሳወቂያውን ዝጋ",
  "feedback.regionLabel": "የሥራ ማሳወቂያዎች",

  // The WEIGHT of a message, spoken to a screen reader before its title.
  "feedback.weight.success": "ተሳክቷል",
  "feedback.weight.error": "ስህተት",
  "feedback.weight.warning": "ስጠንቀቅ",
  "feedback.weight.info": "መረጃ",
  "feedback.weight.loading": "በሂደት ላይ",

  // ── Interpolation examples ────────────────────────────────────────────────
  greeting: "እንኳን ደህና መጡ {{name}}",
  welcome: "እንኳን ደህና መለሱ {{name}}",
  itemCount: "{{count}} ልክ ንብረት ተገኝቷል",
  pageOf: "ገጽ {{current}} ከ{{total}}",
};

export default am;
