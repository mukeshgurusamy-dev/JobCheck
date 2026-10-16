/**
 * Regular expression pattern groups for detecting scam job listings.
 * Each group has an id, point weight, explanation reason, and at least 6 RegExp variants
 * covering Indian phrasing, currency notations (₹/Rs/INR), payment apps, and document types.
 */

export interface PatternGroup {
  id: string;
  weight: number;
  severity: "low" | "medium" | "high";
  reason: string;
  patterns: RegExp[];
}

export const PATTERN_GROUPS: PatternGroup[] = [
  // 1. upfront-payment (+45)
  {
    id: "upfront-payment",
    weight: 45,
    severity: "high",
    reason: "Demands upfront payment (registration, training, kit, laptop, or security deposit) which is a definitive hallmark of job scams.",
    patterns: [
      /(?<!no\s+|never\s+|not\s+)(?:registration|joining|processing|verification|gate\s*pass)\s*(?:[\w\s]{0,20})?\s*(?:fee|fees|charge|charges|amount|cost)/i,
      /(?:training|certification|onboarding|course|interview\s*kit|evaluation\s*kit|hardware\s*kit)\s*(?:[\w\s]{0,20})?\s*(?:fee|fees|charge|charges|cost)/i,
      /(?:refundable|security|caution)\s*(?:deposit|amount|money|caution\s*money|balance|fund)/i,
      /(?:id\s*card|uniform|laptop|courier|insurance|medical|clinic|stamp\s*paper|agreement|bond)\s*(?:[\w\s]{0,20})?\s*(?:charges?|fee|fees|deposit|cost|amount)/i,
      /(?:pay|paying|transfer|send|deposit|must\s*pay)\s*(?:₹|rs\.?|inr)?\s*[\d,]+\s*(?:[\w\s,]{0,50})?\s*(?:fee|fees|charge|charges|cost|deposit|amount|kit|pass|letter|screening|training|onboarding|courier|insurance|uniform)/i,
      /(?:send|pay|transfer|deposit)\s*(?:money|amount|fee)?\s*(?:via|through|on|using)\s*(?:upi|gpay|google\s*pay|phonepe|paytm|qr\s*code)/i,
      /(?:pay|deposit)\s*(?:an\s*initial|token)?\s*amount\s*(?:to|for)\s*(?:receive|process|confirm)\s*(?:offer|appointment|joining)/i,
      /(?:mandatory|compulsory)\s*(?:[\w\s]{0,25})?\s*(?:charges?|fee|fees|cost|deposit|payment)/i,
      /(?:pay|give|spend)\s*(?:money|cash|amount|fees?|[₹\d,]+)?\s*(?:to\s*(?:get|secure|land|receive|guarantee)|for)\s*(?:a\s*)?(?:job|offer|interview|placement|joining)/i,
      /(?:pay|transfer|deposit)\s*(?:₹|rs\.?|inr)?\s*\d+\s*(?:to\s*get\s*(?:a\s*)?job|for\s*(?:a\s*)?job|for\s*placement)/i,
      /(?:job\s*(?:assurance|guarantee|placement)\s*(?:charges|fee|fees|deposit|payment))/i,
      /(?:pay|paying|must\s*pay|transfer)\s*(?:₹|rs\.?|inr)?\s*[\d,]+.*(?:stamp\s*paper|agreement|bond|kit|courier|gate\s*pass|security|joining|offer\s*letter|license|medical|clinic|insurance)/i,
      /(?:start\s*with|joining|initial)\s*(?:investment|deposit|fee|amount)\s*(?:of\s*)?(?:₹|rs\.?|inr)?\s*[\d,]+/i,
      /(?:must\s*pay|pay)\s*(?:₹|rs\.?|inr)?\s*[\d,]+\s*(?:for\s*[\w\s]{0,40})?\s*before\s*(?:interview|joining|test)/i,
      /(?:advance\s*embassy\s*fee|embassy\s*fee|visa\s*fee|placement\s*agent\s*(?:fee|charges?))\s*(?:of\s*)?(?:₹|rs\.?|inr)?\s*[\d,]+/i
    ]
  },

  // 2. task-scam (+40)
  {
    id: "task-scam",
    weight: 40,
    severity: "high",
    reason: "Promotes a task-based or review-rating commission scheme (prevalent fraud targeting freshers and students).",
    patterns: [
      /(?:complete|finish|do|process)\s*(?:daily|simple|merchant|online)?\s*(?:[\w\s]{0,20})?\s*(?:tasks|orders)\s*(?:to\s*earn|for\s*commission|for\s*earnings?)/i,
      /(?:rate|review)\s*(?:\d+\s*)?(?:products|hotels|apps|movies|google\s*maps|listings|orders|merchants?).*(?:earn|commission|money|per\s*review|payout|daily)/i,
      /(?:like|subscribe|follow)\s*(?:youtube|instagram|telegram).*(?:earn|cash|money|commission|tasks)/i,
      /(?:top-?up|recharge|deposit)\s*(?:[\w\s]{0,25})?\s*(?:wallet|account|balance|smart\s*contract)\s*(?:[\w\s]{0,25})?\s*to\s*(?:unlock|continue|withdraw|activate)/i,
      /(?:payout|earnings?|paid|commission|earn)\s*(?:in|via|with)\s*(?:crypto|usdt|bitcoin|binance|trc-?20)/i,
      /(?:hotel\s*rating|merchant\s*order|e-?commerce\s*rating|daily\s*tasks|app\s*rating)\s*(?:job|commission|part-?time)/i,
      /(?:earn|make)\s*(?:commission|roi)\s*per\s*(?:task|click|submission|order|review)/i,
      /(?:merchant\s*order|hotel\s*rating|app\s*rating|review)\s*(?:processing|job|tasks?).*(?:commission|earn|daily)/i
    ]
  },

  // 3. sensitive-docs-early (+35)
  {
    id: "sensitive-docs-early",
    weight: 35,
    severity: "high",
    reason: "Requests sensitive identification documents or financial credentials before any interview or verified offer.",
    patterns: [
      /(?:send|share|upload|submit)\s*(?:your\s*)?(?:aadhaar|aadhar|adhar)\s*(?:card|copy|number|photo)/i,
      /(?:send|share|upload|submit)\s*(?:your\s*)?pan\s*card\s*(?:details|copy|photo|number)/i,
      /(?:share|send|provide)\s*(?:bank\s*account\s*number|bank\s*details|ifsc|cancelled\s*cheque)/i,
      /(?:share|verify|enter)\s*(?:otp|one\s*time\s*password|cvv|atm\s*pin)/i,
      /(?:upload|send|share)\s*(?:selfie\s*with\s*(?:id|aadhaar|card)|face\s*verification\s*photo)/i,
      /(?:passport|driving\s*licen[sc]e)\s*(?:copy|scan)\s*(?:required\s*for|before)\s*(?:registration|screening|interview)/i,
      /(?:submit|provide)\s*(?:net\s*banking|debit\s*card)\s*details/i,
      /(?:connect\s*(?:your\s*)?(?:private\s*)?(?:metamask|crypto\s*wallet|wallet))/i,
      /(?:sign\s*transaction\s*to\s*verify)/i
    ]
  },

  // 4. mlm-referral (+30)
  {
    id: "mlm-referral",
    weight: 30,
    severity: "medium",
    reason: "Uses multi-level marketing (MLM) or pyramid referral recruitment language.",
    patterns: [
      /(?:refer|referring|invite|inviting)\s*(?:\d+\s*)?(?:[\w\s]{0,15})?(?:friends|members|people|contacts|students)\s*to\s*(?:earn|unlock|get)/i,
      /(?:network|direct)\s*marketing\s*(?:opportunity|business|plan)/i,
      /(?:build|grow)\s*your\s*(?:own\s*)?(?:team|downline|network)/i,
      /(?:achieve|enjoy)\s*(?:financial\s*freedom|unlimited\s*residual\s*income)/i,
      /(?:passive|lifetime|residual)\s*income\s*(?:opportunity|system|model|bonus)/i,
      /(?:no\s*selling\s*only\s*sharing|referral\s*bonus\s*on\s*joining)/i,
      /(?:binary\s*plan|multi-?level|downline\s*commission|downline\s*network)/i,
      /(?:buy|purchase)\s*(?:[\w\s]{0,40})?\s*kit\s*for\s*(?:₹|rs\.?|inr)?\s*[\d,]+/i,
      /(?:downline|downline\s*network|pyramid|network\s*marketing)/i,
      /(?:unlock|get)\s*(?:guaranteed|assured|direct)?\s*(?:pre-?placement\s*offer|ppo)/i
    ]
  },

  // 5. unrealistic-pay (+30)
  {
    id: "unrealistic-pay",
    weight: 30,
    severity: "medium",
    reason: "Promises implausible daily/weekly payouts or inflated salaries for inexperienced freshers.",
    patterns: [
      /(?:daily|weekly)\s*(?:payout|payment|income|salary|earnings?)/i,
      /(?:guaranteed|assured)\s*(?:income|earnings?|returns?|payout)/i,
      /(?:earn|make)\s*(?:₹|rs\.?|inr)?\s*[1-9]\d{3,}\s*(?:per\s*day|\/-\s*daily|daily)/i,
      /(?:₹|rs\.?|inr)\s*(?:5[0-9]|[6-9]\d|\d{3,})k?\s*(?:per\s*month|pm)\s*for\s*(?:freshers?|no\s*experience)/i,
      /(?:earn\s*.*(?:₹|rs\.?|inr)?\s*[1-9]\d{4,}\s*(?:weekly|per\s*week))/i,
      /(?:income\s*potential\s*up\s*to|earn\s*easily)\s*(?:₹|rs\.?|inr)?\s*[1-9]\d{4,}\s*daily/i,
      /(?:instant\s*daily\s*cash\s*transfer|per\s*day\s*salary\s*credited)/i
    ]
  },

  // 6. training-then-job (+30)
  {
    id: "training-then-job",
    weight: 30,
    severity: "medium",
    reason: "Promises a job contingent upon paid training or a fee-based internship program.",
    patterns: [
      /(?:paid|chargeable)\s*(?:training|internship).*(?:guaranteed|assured|100%)\s*(?:job|placement)/i,
      /(?:pay\s*for|enroll\s*in)\s*(?:training|course)\s*(?:to\s*get|and\s*get)\s*(?:placed|offer\s*letter)/i,
      /(?:100%|guaranteed|assured)\s*placement\s*(?:after|upon|through|with)\s*(?:[\w\s]{0,25})?\s*(?:training|course|bootcamp)/i,
      /(?:security\s*deposit|course\s*fee)\s*refundable\s*(?:after|upon)\s*(?:job\s*confirmation|completion)/i,
      /(?:invest|pay)\s*(?:in\s*our\s*)?(?:internship|training)\s*program\s*for\s*(?:direct\s*hiring|job)/i,
      /(?:internship\s*fee|training\s*cum\s*placement\s*fee|internship\s*cum\s*placement)/i,
      /(?:paid\s*training\s*cum\s*placement|pay\s*(?:₹|rs\.?|inr|\d+).*training\s*fee)/i
    ]
  },

  // 7. no-skill-easy-money (+25)
  {
    id: "no-skill-easy-money",
    weight: 25,
    severity: "medium",
    reason: "Advertises high income for simple copy-paste, data entry, or zero-qualification tasks.",
    patterns: [
      /(?:no\s*(?:interview|experience|skills?|qualification|exam)\s*(?:or\s*(?:interview|skills?|experience)\s*)?(?:needed|required|necessary))/i,
      /(?:10th[\/\s]*12th|10th|12th)\s*pass\s*(?:can\s*earn|earn\s*(?:₹|rs\.?|inr)?\s*\d{4,})/i,
      /(?:copy-?\s*paste|form\s*filling|sms\s*sending|data\s*entry)/i,
      /(?:just\s*)?(?:1|2|3)\s*hours?\s*(?:a\s*day|daily)\s*work\s*earn\s*(?:₹|rs\.?|inr)/i,
      /(?:typing|ad\s*posting|captcha\s*entry|captcha\s*typing)\s*job\s*(?:high\s*income|earn\s*daily)/i,
      /(?:anyone\s*can\s*earn|housewife\s*student\s*can\s*earn\s*(?:thousands|lakhs))/i,
      /(?:simple\s*mobile\s*work|work\s*from\s*phone\s*earn\s*big)/i
    ]
  },

  // 8. messaging-app-contact (+25)
  {
    id: "messaging-app-contact",
    weight: 25,
    severity: "medium",
    reason: "Instructs candidates to apply or contact the recruiter exclusively through WhatsApp or Telegram.",
    patterns: [
      /(?:contact|msg|message|chat|reach)\s*(?:[\w\s@\.\-]+)?\s*(?:only\s*)?(?:on|via|through)\s*whatsapp/i,
      /(?:send\s*resume|apply)\s*(?:directly\s*)?(?:on|to)\s*whatsapp\s*(?:number)?/i,
      /(?:join|contact)\s*(?:our\s*)?telegram\s*(?:channel|group|hr)/i,
      /(?:wa\.me\/|api\.whatsapp\.com\/|t\.me\/)/i,
      /(?:ping\s*hr\s*on\s*whatsapp|whatsapp\s*your\s*cv\s*to|whatsapp\s*hr)/i,
      /(?:interview\s*will\s*be\s*conducted\s*on\s*whatsapp)/i,
      /(?:whatsapp\s*only|no\s*calls\s*whatsapp\s*only|whatsapp\s*(?:\+?91)?\s*\d{10})/i
    ]
  },

  // 9. instant-offer (+25)
  {
    id: "instant-offer",
    weight: 25,
    severity: "medium",
    reason: "Claims immediate hiring or offers without any rigorous technical/HR interview rounds.",
    patterns: [
      /(?:direct\s*joining|spot\s*offer|spot\s*selection|instant\s*selection|same-?day\s*joining)\s*(?:without|no)\s*(?:interview|exam|test|screening)/i,
      /(?:selected|shortlisted|immediate\s*appointment)\s*without\s*(?:any\s*)?(?:interview|screening|test|exam)/i,
      /(?:offer\s*letter\s*(?:in|within)\s*(?:24|12|2|few)\s*hours?)/i,
      /(?:same-?day\s*joining|immediate\s*appointment\s*letter)/i,
      /(?:chat-?based|text-?based|whatsapp)\s*(?:interview|selection)/i,
      /(?:congratulations\s*you\s*are\s*selected\s*for\s*(?:the\s*post|job))/i,
      /(?:direct\s*gate\s*pass\s*entry|no\s*round\s*direct\s*joining)/i
    ]
  },

  // 10. overseas-offer (+25)
  {
    id: "overseas-offer",
    weight: 25,
    severity: "medium",
    reason: "Overseas job offer requiring upfront visa fees, agent charges, or arranged via informal chat.",
    patterns: [
      /(?:visa|work\s*permit|air\s*ticket)\s*(?:[\w\s]{0,20})?\s*(?:fee|charges|cost|deposit|advance)/i,
      /(?:guaranteed|100%)\s*(?:visa|work\s*permit|job\s*in\s*(?:canada|dubai|gulf|germany|uk|singapore|uae))/i,
      /(?:agent|consultancy)\s*(?:fee|charges)\s*for\s*(?:abroad|overseas|foreign)\s*placement/i,
      /(?:canada|gulf|dubai|malta|poland|singapore|uae)\s*jobs?\s*via\s*(?:whatsapp|telegram)/i,
      /(?:free\s*food\s*free\s*accommodation\s*visa\s*charges\s*apply)/i,
      /(?:pay\s*after\s*visa|advance\s*for\s*embassy\s*medical|embassy\s*(?:fee|deposit|advance))/i,
      /(?:overseas\s*employment\s*agent\s*commission)/i
    ]
  },

  // 11. free-email (+20)
  {
    id: "free-email",
    weight: 20,
    severity: "low",
    reason: "Recruiter contact email uses a free public provider (Gmail, Yahoo, Outlook) rather than an official corporate domain.",
    patterns: [
      /[a-zA-Z0-9._%+-]+@gmail\.com\b/i,
      /[a-zA-Z0-9._%+-]+@yahoo\.(?:com|in|co\.in)\b/i,
      /[a-zA-Z0-9._%+-]+@outlook\.com\b/i,
      /[a-zA-Z0-9._%+-]+@hotmail\.com\b/i,
      /[a-zA-Z0-9._%+-]+@rediffmail\.com\b/i,
      /(?:send\s*resume\s*to|hr\s*mail\s*id[:\s]+)[a-zA-Z0-9._%+-]+@(?:gmail|yahoo|outlook)\.com/i,
      /(?:official\s*hr\s*email\s*is\s*at\s*(?:gmail|yahoo|rediff))/i
    ]
  },

  // 12. fake-fresher-demands (+20)
  {
    id: "fake-fresher-demands",
    weight: 20,
    severity: "low",
    reason: "Contradictory job requirements such as requiring years of experience for a fresher or entry-level role.",
    patterns: [
      /(?:fresher|freshers?)(?:\s*(?:role|candidate|position|engineer))?\s*(?:with|must\s*have|requiring|requires?)\s*[2-9]\+?\s*years?/i,
      /(?:entry-?level|0\s*years?\s*exp)\s*(?:with|requires?)\s*[3-9]\+?\s*years?\s*(?:of\s*)?exp/i,
      /(?:fresh\s*graduates?)\s*with\s*(?:minimum\s*)?[2-9]\s*years?\s*hands-?on\s*experience/i,
      /(?:fresher\s*role|entry\s*job)\s*.*(?:lead\s*architect|senior\s*manager\s*level)/i,
      /(?:0-1\s*year\s*experience)\s*.*(?:proven\s*track\s*record\s*of\s*[3-9]\s*years)/i,
      /(?:entry\s*level\s*position\s*requires\s*5\+\s*years)/i
    ]
  },

  // 13. urgency-pressure (+15)
  {
    id: "urgency-pressure",
    weight: 15,
    severity: "low",
    reason: "Uses high-pressure urgency tactics (limited slots, countdowns) to prevent candidates from verifying details.",
    patterns: [
      /(?:limited\s*seats|few\s*openings\s*left|only\s*[1-9]\s*slots?\s*remaining)/i,
      /(?:apply\s*now\s*!{2,}|urgent\s*opening\s*!{2,})/i,
      /(?:offer\s*valid\s*(?:today|till\s*tonight|for\s*24\s*hours)\s*only)/i,
      /(?:don't\s*miss\s*this\s*golden\s*opportunity|last\s*chance\s*to\s*apply)/i,
      /(?:immediate\s*spot\s*joining\s*within\s*today)/i,
      /(?:first\s*come\s*first\s*serve\s*basis\s*hiring)/i,
      /(?:apply\s*immediately\s*before\s*link\s*expires)/i
    ]
  },

  // 14. vague-employer (+15)
  {
    id: "vague-employer",
    weight: 15,
    severity: "low",
    reason: "Vague company identity (e.g. 'Leading MNC', 'Confidential Client') hiding who the real employer actually is.",
    patterns: [
      /(?:leading|top|reputed)\s*(?:fortune\s*500\s*)?mnc\s*(?:is\s*hiring|requires|urgent\s*requirement)(?!\s*company\s*name)/i,
      /(?:confidential\s*client|undisclosed\s*employer|top\s*fortune\s*500\s*client)\s*hiring/i,
      /(?:any\s*graduate|any\s*stream|any\s*degree)\s*(?:with\s*no\s*specific\s*criteria)/i,
      /(?:work\s*location[:\s]+anywhere\s*in\s*india|pan\s*india\s*any\s*location\s*open)/i,
      /(?:hiring\s*for\s*an\s*international\s*brand\s*\(confidential\))/i,
      /(?:client\s*of\s*consultancy\s*no\s*name\s*disclosed)/i,
      /(?:multinational\s*corporation\s*seeks\s*freshers\s*without\s*company\s*profile)/i
    ]
  },

  // 15. writing-style (+10)
  {
    id: "writing-style",
    weight: 10,
    severity: "low",
    reason: "Unprofessional communication style characterized by excessive exclamation marks, ALL-CAPS, or emoji spam.",
    patterns: [
      /!{3,}/,
      /\b[A-Z]{6,}\s+[A-Z]{6,}\s+[A-Z]{6,}\b/,
      /(?:💰|🔥|✅|💸|🤑|🚀|💵|👉|📲){3,}/u,
      /(?:urgent\s*urgent\s*urgent|hiring\s*hiring\s*hiring)/i,
      /(?:100%\s*100%\s*100%|guarantee\s*guarantee)/i,
      /\?{3,}/
    ]
  },

  // 16. remote-access-software (+35)
  {
    id: "remote-access-software",
    weight: 35,
    severity: "high",
    reason: "Instructs candidate to install remote desktop or screen-sharing tools (AnyDesk, TeamViewer) which can lead to device compromise and financial theft.",
    patterns: [
      /(?:install|download|open|setup)\s*(?:anydesk|teamviewer|ultraviewer|rustdesk|quicksupport)/i,
      /(?:anydesk|teamviewer|ultraviewer)\s*(?:code|id|session|number|app)/i,
      /(?:connect\s*via|screen\s*share\s*on)\s*(?:anydesk|teamviewer|ultraviewer)/i,
      /(?:install|download)\s*(?:remote\s*access|remote\s*support)\s*software\s*(?:for\s*interview|for\s*test)/i,
      /(?:share\s*your\s*screen\s*code\s*from\s*anydesk)/i,
      /(?:remote\s*desktop\s*connection\s*mandatory\s*for\s*joining)/i
    ]
  },

  // 17. paid-medical-exam (+30)
  {
    id: "paid-medical-exam",
    weight: 30,
    severity: "medium",
    reason: "Requires payment for medical fitness certificates or unaccredited health checkups prior to onboarding.",
    patterns: [
      /(?:medical|fitness|health\s*checkup?)\s*(?:fee|fees|charges?|cost|deposit)/i,
      /(?:pay|deposit)\s*(?:for\s*)?(?:medical\s*test|medical\s*certificate|clinic\s*charges)/i,
      /(?:mandatory|compulsory)\s*medical\s*(?:screening\s*)?(?:charges|fee|payment)/i,
      /(?:medical\s*examination\s*charges\s*refundable)/i,
      /(?:blood\s*test|fitness\s*certificate)\s*fee\s*(?:to\s*be\s*paid)/i,
      /(?:stamp\s*paper|agreement\s*drafting|bond\s*paper)\s*(?:charges|fee|cost)/i
    ]
  },

  // 18. sender-domain-mismatch (+20)
  {
    id: "sender-domain-mismatch",
    weight: 20,
    severity: "low",
    reason: "Recruiter contact email domain does not match the official employer website domain.",
    patterns: []
  },

  // 19. cryptocurrency-payment (+45) - NEW 2026
  {
    id: "cryptocurrency-payment",
    weight: 45,
    severity: "high",
    reason: "Requests payment, deposits, or transactions in cryptocurrency (Bitcoin, USDT, TRC-20) which is untraceable and a major scam indicator.",
    patterns: [
      /(?:pay|deposit|transfer|send)[\w\s]{0,40}(?:in|via|using|through)\s+(?:crypto|cryptocurrency|bitcoin|btc|usdt|tether|trc-?20|binance|ethereum|eth)/i,
      /(?:in|via|using|through)\s+(?:crypto|cryptocurrency|bitcoin|btc|usdt|tether|trc-?20|ethereum|eth)/i,
      /(?:wallet\s*address|crypto\s*wallet|btc\s*wallet|usdt\s*wallet|trc-?20\s*address)/i,
      /(?:top-?up|recharge|deposit)\s*(?:[\w\s]{0,25})?\s*(?:in\s*)?(?:usdt|bitcoin|crypto|trc-?20)/i,
      /(?:withdraw|payout|earnings?)\s*(?:only\s*)?(?:in|via)\s*(?:crypto|cryptocurrency|usdt|bitcoin)/i,
      /(?:connect[\w\s]{0,20}(?:metamask|trust\s*wallet|crypto\s*wallet)|(?:smart\s*contract|blockchain\s*wallet|metamask|trust\s*wallet)[\w\s]{0,20}(?:connect|connection|approval|signature|wallet))/i,
      /(?:invest|deposit)\s*(?:₹|rs\.?|inr|\$)?\s*[\d,]+\s*(?:in\s*)?(?:crypto|usdt|bitcoin)\s*(?:to\s*(?:start|unlock|activate))/i,
      /(?:minimum\s*)?(?:crypto|usdt|bitcoin)\s*(?:deposit|investment)\s*(?:required|needed|mandatory)/i
    ]
  },

  // 20. investment-scheme (+40) - NEW 2026
  {
    id: "investment-scheme",
    weight: 40,
    severity: "high",
    reason: "Describes an investment or trading scheme disguised as a job, requiring initial capital with guaranteed returns.",
    patterns: [
      /(?:invest|deposit)[^.!?\n]{0,35}(?:and\s*)?(?:earn|get|receive|make)[^.!?\n]{0,25}(?:guaranteed|assured|fixed)[^.!?\n]{0,15}(?:returns?|profit|roi)/i,
      /(?:guaranteed|assured|fixed)[\w\s]{0,20}(?:returns?|profit|roi|income)/i,
      /(?:trading|forex|stock\s*market|options\s*trading)[\w\s]{0,30}(?:guaranteed|assured)[\w\s]{0,20}(?:profit|returns?|income)/i,
      /(?:investment|capital)\s*(?:required|needed|mandatory)/i,
      /(?:roi|return\s*on\s*investment)[\w\s]{0,15}(?:\d+)%[\w\s]{0,20}(?:guaranteed|assured|fixed|daily|weekly|monthly)/i,
      /(?:binary\s*options|forex\s*trading|day\s*trading)[\w\s]{0,20}(?:no\s*risk|guaranteed|zero\s*loss)/i,
      /(?:passive\s*income|residual\s*income)[\w\s]{0,20}(?:one-?time|initial)\s*(?:investment|deposit)/i
    ]
  },

  // 21. advance-salary-loan (+35) - NEW 2026
  {
    id: "advance-salary-loan",
    weight: 35,
    severity: "high",
    reason: "Offers advance salary or loan before joining, then asks for processing fee or insurance - classic advance fee fraud.",
    patterns: [
      /(?:advance\s*salary|salary\s*in\s*advance|pre-?joining\s*salary)/i,
      /(?:get|receive)[^.!?\n]{0,30}(?:advance|upfront)[^.!?\n]{0,20}before\s*(?:joining|start)/i,
      /(?:loan|advance)[\w\s]{0,20}(?:against|before)[\w\s]{0,20}(?:salary|joining|first\s*month)/i,
      /(?:advance|loan|salary)[\w\s]{0,20}(?:processing|insurance|guarantee)\s*(?:fee|charges?)/i,
      /(?:collect|receive)[\w\s]{0,20}(?:salary|payment)[\w\s]{0,30}(?:after\s*paying|by\s*paying)[\w\s]{0,20}(?:processing|insurance|verification)\s*(?:fee|charges?)/i,
      /(?:instant\s*salary\s*advance|same-?day\s*salary\s*loan)/i
    ]
  },

  // 22. fake-government-job (+40) - NEW 2026
  {
    id: "fake-government-job",
    weight: 40,
    severity: "high",
    reason: "Falsely claims to be a government job or uses government authority names to appear legitimate, then asks for fees.",
    patterns: [
      /(?:government|govt|sarkari)[\w\s]{0,20}(?:job|vacancy|recruitment|bank\s*recruitment)[\w\s]{0,40}(?:fee|charges?|deposit|payment|guaranteed|confirmed)/i,
      /(?:railway|indian\s*railways|irctc|defence|indian\s*army|navy|air\s*force|police|psu(?:\s*bank)?|public\s*sector)[^.!?\n]{0,35}(?:recruitment|vacancy)[^.!?\n]{0,45}(?:registration|application|processing|pay\s*fee|fee|charges?)/i,
      /(?:indian\s*army|defence|police|railway)[^.!?\n]{0,20}vacancy[^.!?\n]{0,30}(?:pay\s*fee|fee)/i,
      /(?:sarkari\s*naukri|sarkari\s*result)[\w\s]{0,30}(?:guaranteed|confirmed)/i,
      /(?:upsc|ssc|rrb|ibps)[\w\s]{0,30}(?:guaranteed|shortcut|direct)/i,
      /(?:government\s*certified|govt\s*approved)[\w\s]{0,20}(?:placement|recruitment)/i,
      /(?:government|govt|sarkari)[\w\s]{0,15}(?:guaranteed|confirmed)/i
    ]
  },

  // 23. data-harvesting (+30) - NEW 2026
  {
    id: "data-harvesting",
    weight: 30,
    severity: "medium",
    reason: "Suspicious data collection requests beyond normal recruitment (biometric, family details, references without interview).",
    patterns: [
      /(?:provide|submit|share|require|undergo|complete)[^.!?\n]{0,30}(?:biometric|fingerprint|iris\s*scan|facial\s*recognition)/i,
      /(?:biometric|fingerprint|iris\s*scan|facial\s*recognition)[^.!?\n]{0,25}(?:data|details|required|mandatory|needed)/i,
      /(?:family\s*members?|parents?|spouse)[^.!?\n]{0,35}(?:aadhaar|pan\s*card|bank\s*(?:details|account))/i,
      /(?:3|three|5|five)\s*(?:personal\s*)?references?[^.!?\n]{0,30}(?:aadhaar|full\s*details)[^.!?\n]{0,20}(?:mandatory|required)/i,
      /(?:emergency\s*contact|nominee)[^.!?\n]{0,30}(?:bank\s*account|pan\s*card|aadhaar)/i,
      /(?:download|install)[^.!?\n]{0,30}(?:app|application)[^.!?\n]{0,40}(?:verify|complete|submit)[^.!?\n]{0,20}(?:kyc|profile)/i
    ]
  },

  // 24. fake-internship-conversion (+35) - NEW 2026
  {
    id: "fake-internship-conversion",
    weight: 35,
    severity: "high",
    reason: "Promises full-time job after paid internship but internship itself requires upfront fee - classic fresher trap.",
    patterns: [
      /(?:paid\s*internship|internship\s*cum\s*placement)[\w\s,]{0,25}(?:guaranteed|assured|100%|enrollment|registration|charges|fee)/i,
      /(?:pay|deposit|fee)[^.!?\n]{0,25}internship[^.!?\n]{0,35}(?:full-?time\s*offer|job|placement|position)/i,
      /(?:intern|internship)[^.!?\n]{0,30}(?:then|after)[^.!?\n]{0,30}(?:direct\s*hiring|placement|job|ppo)\s*(?:confirmed|guaranteed)/i,
      /(?:internship\s*registration|internship\s*enrollment)\s*(?:fee|charges?|cost)/i,
      /(?:internship\s*fee|internship)[^.!?\n]{0,30}(?:fee|charges?)[^.!?\n]{0,30}(?:refundable)/i,
      /(?:pay|deposit)[^.!?\n]{0,30}(?:secure|confirm|guarantee)[^.!?\n]{0,25}(?:internship|intern)/i,
      /(?:internship)[^.!?\n]{0,40}(?:then|followed\s*by)[^.!?\n]{0,35}(?:guaranteed|confirmed|direct)[^.!?\n]{0,25}(?:job|placement|ppo)/i,
      /(?:guaranteed|assured|100%)\s*(?:ppo|job|placement)[^.!?\n]{0,35}(?:internship|intern)/i
    ]
  },

  // 25. fake-verification-portal (+35) - NEW 2026
  {
    id: "fake-verification-portal",
    weight: 35,
    severity: "high",
    reason: "Directs to external verification or background check portal requiring payment - likely phishing or fee scam.",
    patterns: [
      /(?:complete|verify|finish)[\w\s]{0,30}(?:background|identity|police|criminal)[\w\s]{0,30}(?:verification|check)[\w\s]{0,30}(?:on|at|via|through)[\w\s]{0,20}(?:portal|external|website)/i,
      /(?:background\s*verification|police\s*verification|identity\s*check)[\w\s]{0,30}(?:charges?|fee|cost|payment)/i,
      /(?:background\s*check|verification)[^.!?\n]{0,20}fee[^.!?\n]{0,35}(?:screening\s*website|portal)/i,
      /(?:third-?party|external)[\w\s]{0,20}(?:verification|validation|screening)[\w\s]{0,20}(?:mandatory|compulsory|required)/i,
      /(?:verification\s*portal|screening\s*website)[\w\s]{0,20}(?:requires?|payment|fee)/i,
      /(?:click|visit|goto)[\w\s]{0,20}(?:link|url|portal)[\w\s]{0,30}(?:verify|complete|submit)/i,
      /(?:mandatory|compulsory)[\w\s-]{0,20}(?:pre-?employment|background)[\w\s]{0,20}check[\w\s]{0,20}(?:on|at)\s*portal/i
    ]
  },

  // 26. exam-study-material-fee (+30) - NEW 2026
  {
    id: "exam-study-material-fee",
    weight: 30,
    severity: "medium",
    reason: "Charges for exam preparation materials, mock tests, or study guides as prerequisite for job - monetizing recruitment.",
    patterns: [
      /(?:study\s*material|preparation\s*kit|mock\s*test|practice\s*papers?)[\w\s]{0,30}(?:fee|charges?|cost|payment)/i,
      /(?:purchase|buy|pay\s*for)[^.!?\n]{0,30}(?:mock\s*test|test\s*series|exam\s*material|study\s*material|exam\s*guide|assessment\s*kit|preparation)/i,
      /(?:mock\s*test|exam\s*guide|study\s*material)[^.!?\n]{0,30}(?:compulsory|mandatory|cost|fee|package)/i,
      /(?:mandatory|compulsory)[\w\s]{0,30}(?:preparation|training|study)[\w\s]{0,30}(?:package|course|material|kit)/i,
      /(?:exam|test|assessment)[\w\s]{0,20}(?:preparation|kit|material)[\w\s]{0,30}(?:compulsory|mandatory|required)/i,
      /(?:exam|test)[\w\s]{0,20}(?:material|kit|preparation)[\w\s]{0,20}(?:before\s*interview)/i,
      /(?:compulsory|mandatory)[^.!?\n]{0,30}exam\s*material/i
    ]
  },

  // 27. hinglish-scam-language (+25) - NEW
  //
  // Romanised Hindi/Hinglish is how most fraudulent offers actually reach
  // Indian job seekers — the WhatsApp and Telegram messages are not written in
  // English. Every pattern below requires an explicit Hinglish marker word and
  // uses \b, so ordinary English postings and place names that merely contain
  // these letter sequences (e.g. "Mana-pakka-m", a real Chennai locality) do
  // not match.
  {
    id: "hinglish-scam-language",
    weight: 25,
    severity: "medium",
    reason: "Uses Hinglish (romanised Hindi) scam phrasing — the way fraudulent job offers are actually circulated on WhatsApp and Telegram.",
    patterns: [
      /\b(?:paise?|paisa|rupaye|rupaya)\s+(?:bhejo|bhejna|bhej\s*do|jama\s*karo|transfer\s*karo|deposit\s*karo|de\s*do|do)\b/i,
      /\b(?:registration|joining|training|entry|form)\s*(?:ki|ke|ka)\s*(?:fees?|paise|paisa|charges?|kharcha)\b/i,
      /\bkoi\s+(?:fees?|paise?|charges?)\s+(?:nahi|nahin)\b/i,
      /\bghar\s+(?:baithe|se|baith\s*kar)\s+(?:kaam|kamai|paisa|kamaye?|kamao|earning)\b/i,
      /\b(?:naukri|job|kaam)\s+(?:pakki|pakka|guaranteed|guarantee|confirm)\b/i,
      /\b(?:turant|foran|jaldi|abhi)\s+(?:joining|naukri|job|paisa|kamai|apply|kaam)\b/i,
      /\bsirf\s+(?:₹|rs\.?|inr)?\s*[\d,]+\s*(?:mein|me|rupaye|rupees?|rs)\b/i,
      /\b(?:whatsapp|telegram)\s+(?:par|pe|pr)\s+(?:message|msg|contact|baat|sampark|call)\b/i,
      /\b(?:kamai|kamaye|kamayen|income)\s+(?:ke\s+liye\s+)?(?:paisa|fees?|investment|invest)\s+(?:lagaye|laga|lagana|de|do|karo)\b/i,
      /\b(?:roz|roj|har\s+din)\s+(?:₹|rs\.?|inr)?\s*[\d,]+\s*(?:rupaye|rupees?|kamai|income|kamao|kamaye)\b/i,
      /\b(?:pehle|pahle)\s+(?:fees?|paise?|payment)\s+(?:de|do|dena|bharo|jama|karo|kar)\b/i
    ]
  }
];
