import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import rawData from './data.json'
import PersonAvatar from './components/PersonAvatar'
import './App.css'

// ══════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════
const EDU_ORDER = {
  '': 0,
  'ประกาศนียบัตรวิชาชีพ': 1,
  'ปริญญาตรี': 2,
  'ปริญญาโท': 3,
  'ปริญญาเอก': 4,
  'หลักสูตรเสนาธิการ': 5,
  'วิทยาลัยป้องกันราชอาณาจักร': 6,
}
const EDU_LIST = Object.keys(EDU_ORDER).filter(Boolean)

const RANK_LEVEL = {
  'จ.ส.ต.': 1, 'จ.ส.ท.': 2, 'จ.ส.อ.': 3,
  'ร.ต.': 4,   'ร.ท.': 5,   'ร.อ.': 6,
  'น.ต.': 4,   'น.ท.': 5,   'น.อ.': 6,
  'พ.ต.': 7,   'พ.ท.': 8,   'พ.อ.': 9,  'พ.อ.(พ)': 9,
  'พล.ต.': 10, 'พล.ท.': 11, 'พล.อ.': 12,
  'พล.ร.ต.': 10, 'พล.ร.ท.': 11, 'พล.ร.อ.': 12,
  'พล.อ.ต.': 10, 'พล.อ.ท.': 11, 'พล.อ.อ.': 12,
}
const RANK_LIST = [
  'จ.ส.ต.','จ.ส.ท.','จ.ส.อ.',
  'ร.ต.','ร.ท.','ร.อ.',
  'พ.ต.','พ.ท.','พ.อ.','พ.อ.(พ)',
  'พล.ต.','พล.ท.','พล.อ.',
  'พล.ร.ต.','พล.ร.ท.','พล.ร.อ.',
  'พล.อ.ต.','พล.อ.ท.','พล.อ.อ.',
]

const STATUS_INFO = {
  '1': { label: 'บรรจุจริง', color: '#22c55e' },
  '0': { label: 'ว่าง',      color: '#f59e0b' },
  '3': { label: 'ปิด',       color: '#ef4444' },
}
const getStatus = s => STATUS_INFO[s] || { label: s || '—', color: '#94a3b8' }

// ══════════════════════════════════════════════════════
//  SENIORITY HELPERS
// ══════════════════════════════════════════════════════
const CURRENT_BE = new Date().getFullYear() + 543  // ปี พ.ศ. ปัจจุบัน

// ── สาขาวิชาที่พบบ่อยในระบบ ────────────────────────────────
const STUDY_FIELDS = [
  'คอมพิวเตอร์','เทคโนโลยีสารสนเทศ','วิศวกรรมคอมพิวเตอร์',
  'บริหารธุรกิจ','การจัดการ','รัฐศาสตร์','รัฐประศาสนศาสตร์',
  'นิติศาสตร์','เศรษฐศาสตร์','บัญชี','การเงิน',
  'วิศวกรรมศาสตร์','วิทยาศาสตร์','สังคมศาสตร์',
  'ภาษาต่างประเทศ','การสื่อสาร','สาธารณสุข',
]

// ── คำนวณลำดับอาวุโส ─────────────────────────────────────
// sortType: 'fit' | 'lcht' | 'service' | 'rank_age' | 'age'
function getSeniorityScore(person, sortType = 'lcht') {
  if (!person) return 99999
  if (sortType === 'service') {
    // อายุงาน: รับราชการนานกว่า = อาวุโสกว่า = score ต่ำกว่า
    return 9999 - (person.years_service ?? 0)
  }
  if (sortType === 'rank_age') {
    // อายุยศ: ครองยศนานกว่า = อาวุโสในยศกว่า = score ต่ำกว่า
    return 9999 - (person.years_in_rank ?? 0)
  }
  if (sortType === 'age') {
    // อายุตัว: เกิดก่อน = อาวุโสกว่า = birth_be ต่ำกว่า
    return person.birth_be ?? (person.entry_be ? person.entry_be - 22 : 99999)
  }
  // default 'lcht': ใช้ ลชท.หลัก เป็นหลัก (น้อย = อาวุโส)
  if (person.lcht_main != null) return person.lcht_main
  if (person.entry_be) return (person.entry_be - 2500) * 1000
  return 99999
}

// ── ป้ายแสดงอาวุโส ─────────────────────────────────────
function seniorityLabel(person) {
  if (!person) return null
  const parts = []
  if (person.lcht_main != null)  parts.push(`ลชท.${person.lcht_main}`)
  if (person.years_service != null) parts.push(`${person.years_service}ปีงาน`)
  if (person.years_in_rank != null) parts.push(`ยศ ${person.years_in_rank}ปี`)
  return parts.join(' · ') || null
}

// อายุตัว (ปี)
function getAge(person) {
  if (!person) return null
  const by = person.birth_be ?? (person.entry_be ? person.entry_be - 22 : null)
  return by ? CURRENT_BE - by : null
}

// ══════════════════════════════════════════════════════
//  CONDITION ENGINE
//  แต่ละ condition มีสองรูปแบบ:
//  1) type:'simple'  → เงื่อนไขพื้นฐาน (ใช้กับทุกตำแหน่ง)
//  2) type:'rule'    → กฎ IF-THEN  (ใช้เฉพาะเมื่อตำแหน่งตรงกับ when{})
// ══════════════════════════════════════════════════════
function posMatchWhen(position, when = {}) {
  if (when.pos_rank_req && when.pos_rank_req !== '' && position.rank_req !== when.pos_rank_req) return false
  if (when.pos_branch   && when.pos_branch   !== '' && position.branch   !== when.pos_branch)   return false
  if (when.pos_level    && when.pos_level    !== '' && position.level    !== when.pos_level)    return false
  if (when.pos_status   && when.pos_status   !== '' && position.status   !== when.pos_status)   return false
  return true
}

function evalConditions(conditions, person, position) {
  const violations = []
  for (const c of conditions) {
    if (!c.enabled) continue

    // ── simple conditions ──────────────────────────────
    if (c.type === 'simple') {
      if (c.rule === 'rank_match') {
        if (person?.rank_req && position.rank_req && person.rank_req !== position.rank_req)
          violations.push(`อัตราไม่ตรง: ต้องการ ${position.rank_req} แต่มี ${person.rank_req}`)
      }
      if (c.rule === 'no_close' && position.status === '3')
        violations.push('ตำแหน่งถูกปิด ไม่อนุญาตให้บรรจุ')
      if (c.rule === 'branch_match') {
        if (position.branch && position.branch !== '*' && person?.branch && person.branch !== position.branch)
          violations.push(`สาย/สธ.ไม่ตรง: ต้องการ ${position.branch} แต่มี ${person?.branch}`)
      }
    }

    // ── rule-based IF-THEN conditions ─────────────────
    if (c.type === 'rule') {
      if (!posMatchWhen(position, c.when)) continue   // ตำแหน่งนี้ไม่ตรงเงื่อนไข IF → ข้าม

      const req = c.require || {}

      // rank_min: ยศต้องไม่ต่ำกว่า
      if (req.rank_min && req.rank_min !== '') {
        const pLv  = RANK_LEVEL[person?.rank_req] || 0
        const minLv = RANK_LEVEL[req.rank_min] || 0
        if (pLv < minLv)
          violations.push(`ยศต้องไม่ต่ำกว่า ${req.rank_min} (มี ${person?.rank_req || 'ไม่ระบุ'})`)
      }

      // rank_exact: ยศต้องตรงพอดี
      if (req.rank_exact && req.rank_exact !== '' && person?.rank_req !== req.rank_exact)
        violations.push(`ยศต้องเป็น ${req.rank_exact} (มี ${person?.rank_req || 'ไม่ระบุ'})`)

      // edu_min: คุณวุฒิขั้นต่ำ
      if (req.edu_min && req.edu_min !== '') {
        const pEdu  = EDU_ORDER[person?.education] || 0
        const minEdu = EDU_ORDER[req.edu_min] || 0
        if (pEdu < minEdu)
          violations.push(`คุณวุฒิต้องไม่ต่ำกว่า ${req.edu_min} (มี ${person?.education || 'ไม่ระบุ'})`)
      }

      // edu_exact: ต้องจบหลักสูตรที่ระบุ
      if (req.edu_exact && req.edu_exact !== '') {
        const pEdu  = EDU_ORDER[person?.education] || 0
        const reqEdu = EDU_ORDER[req.edu_exact] || 0
        if (pEdu < reqEdu)
          violations.push(`ต้องผ่านหลักสูตร ${req.edu_exact} (มี ${person?.education || 'ไม่ระบุ'})`)
      }

      // branch: สายต้องตรง
      if (req.branch && req.branch !== '' && person?.branch !== req.branch)
        violations.push(`สายต้องเป็น ${req.branch} (มี ${person?.branch || 'ไม่ระบุ'})`)

      // corps: เหล่าต้องตรง
      if (req.corps && req.corps !== '' && person?.corps !== req.corps)
        violations.push(`เหล่าต้องเป็น ${req.corps} (มี ${person?.corps || 'ไม่ระบุ'})`)

      // origin: กำเนิดต้องตรง
      if (req.origin && req.origin !== '' && person?.origin !== req.origin)
        violations.push(`กำเนิดต้องเป็น ${req.origin} (มี ${person?.origin || 'ไม่ระบุ'})`)

      // study_field: สาขาวิชาต้องตรง (keyword match)
      if (req.study_field && req.study_field !== '') {
        const pField   = (person?.study_field || '').toLowerCase()
        const reqField = req.study_field.toLowerCase()
        if (!pField || !pField.includes(reqField))
          violations.push(`ต้องมีสาขาวิชา "${req.study_field}" (มี "${person?.study_field || 'ไม่ระบุ'}")`)
      }

      // seniority_min_service: อายุงานขั้นต่ำ (ปี)
      if (req.seniority_min_service && req.seniority_min_service !== '') {
        const minYrs = parseInt(req.seniority_min_service)
        const pYrs   = person?.years_service ?? 0
        if (pYrs < minYrs)
          violations.push(`ต้องรับราชการมาแล้วอย่างน้อย ${minYrs} ปี (มี ${pYrs || 0} ปี)`)
      }

      // years_in_rank_min: อายุยศขั้นต่ำ (ปีที่ครองยศปัจจุบัน)
      if (req.years_in_rank_min && req.years_in_rank_min !== '') {
        const minYrs = parseInt(req.years_in_rank_min)
        const pYrs   = person?.years_in_rank ?? 0
        if (pYrs < minYrs)
          violations.push(`ต้องครองยศ ${person?.rank_req || ''} มาแล้วอย่างน้อย ${minYrs} ปี (มี ${pYrs} ปี)`)
      }

      // lcht_max: ลำดับ ลชท.หลัก ต้องไม่เกิน (น้อย = อาวุโส)
      if (req.lcht_max && req.lcht_max !== '') {
        const maxN = parseInt(req.lcht_max)
        const pN   = person?.lcht_main
        if (pN == null)
          violations.push(`ต้องมีลำดับ ลชท. ≤ ${maxN} (ไม่มีข้อมูล ลชท.)`)
        else if (pN > maxN)
          violations.push(`ลำดับ ลชท.${pN} เกินกำหนด (ต้องไม่เกิน ${maxN})`)
      }
    }
  }
  return violations
}

// match score (lower = better fit)
// sortType: 'fit' | 'lcht' | 'service' | 'rank_age' | 'age'
function matchScore(person, position, sortType = 'fit') {
  let score = 0
  if (person.rank_req === position.rank_req) score -= 10
  if (position.branch && position.branch !== '*' && person.branch === position.branch) score -= 5
  const rd = Math.abs((RANK_LEVEL[person.rank_req]||5) - (RANK_LEVEL[position.rank_req]||5))
  score += rd * 2
  // ถ้าเรียงตามอาวุโส: บวก seniority score เข้าไป (normalize ให้เล็กๆ)
  if (sortType !== 'fit') {
    const senScore = getSeniorityScore(person, sortType) / 100000
    score += senScore
  }
  return score
}

// ══════════════════════════════════════════════════════
//  DEFAULT RULES (including the example from user)
// ══════════════════════════════════════════════════════
const DEFAULT_CONDITIONS = [
  {
    id: 1, type: 'simple', rule: 'rank_match', enabled: true,
    label: 'อัตราต้องตรงกัน (ทุกตำแหน่ง)',
  },
  {
    id: 2, type: 'simple', rule: 'no_close', enabled: true,
    label: 'ห้ามบรรจุตำแหน่งที่ปิด',
  },
  {
    id: 3, type: 'rule', enabled: true,
    label: 'พ.อ.(พ) สธ. → จบหลักสูตรเสนาธิการ + ยศ ≥ พ.อ.',
    when:    { pos_rank_req: 'พ.อ.(พ)', pos_branch: 'สธ.' },
    require: { edu_exact: 'หลักสูตรเสนาธิการ', rank_min: 'พ.อ.' },
  },
]

// ══════════════════════════════════════════════════════
//  SMALL COMPONENTS
// ══════════════════════════════════════════════════════
function Badge({ children, bg = '#dbeafe', color = '#1d4ed8' }) {
  return (
    <span style={{
      padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700,
      color, background: bg, whiteSpace: 'nowrap', display: 'inline-block',
    }}>{children}</span>
  )
}

// ── Condition row display ──────────────────────────────────────────────────
function CondRow({ c, onToggle, onRemove, onEdit }) {
  return (
    <div className={`cond-row ${c.type === 'rule' ? 'cond-rule' : ''}`}>
      <input type="checkbox" checked={c.enabled} onChange={onToggle}
        style={{ accentColor: '#0d2d5e', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: c.type === 'rule' ? '#0c4a6e' : '#1e293b' }}>
          {c.type === 'rule' && <span style={{ fontSize: 10, background: '#bae6fd', color: '#0c4a6e', borderRadius: 4, padding: '1px 5px', marginRight: 5 }}>IF-THEN</span>}
          {c.label}
        </div>
        {c.type === 'rule' && (
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
            <span style={{ color: '#0369a1' }}>IF </span>
            {c.when?.pos_rank_req && `อัตรา=${c.when.pos_rank_req} `}
            {c.when?.pos_branch   && `สาย=${c.when.pos_branch} `}
            {c.when?.pos_level    && `ระดับ=${c.when.pos_level} `}
            <span style={{ color: '#059669' }}>→ THEN </span>
            {c.require?.rank_min              && `ยศ≥${c.require.rank_min} `}
            {c.require?.rank_exact            && `ยศ=${c.require.rank_exact} `}
            {c.require?.edu_min               && `คุณวุฒิ≥${c.require.edu_min} `}
            {c.require?.edu_exact             && `จบ${c.require.edu_exact} `}
            {c.require?.branch                && `สาย=${c.require.branch} `}
            {c.require?.corps                 && `เหล่า=${c.require.corps} `}
            {c.require?.origin                && `กำเนิด=${c.require.origin} `}
            {c.require?.study_field           && `สาขา=${c.require.study_field} `}
            {c.require?.seniority_min_service && `อายุงาน≥${c.require.seniority_min_service}ปี `}
            {c.require?.years_in_rank_min     && `อายุยศ≥${c.require.years_in_rank_min}ปี `}
            {c.require?.lcht_max              && `ลชท.≤${c.require.lcht_max} `}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {c.type === 'rule' && (
          <button className="cond-edit" onClick={onEdit} title="แก้ไข">✏</button>
        )}
        <button className="cond-rm" onClick={onRemove} title="ลบ">✕</button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  RULE EDITOR MODAL
// ══════════════════════════════════════════════════════
function RuleModal({ rule, onSave, onClose, uniqueRanks, uniqueBranches }) {
  const [form, setForm] = useState(rule || {
    type: 'rule', enabled: true, label: '',
    when:    { pos_rank_req: '', pos_branch: '', pos_level: '' },
    require: { rank_min: '', rank_exact: '', edu_exact: '', edu_min: '', branch: '', corps: '', origin: '', study_field: '', seniority_min_service: '', years_in_rank_min: '', lcht_max: '' },
  })

  const set = (path, val) => {
    setForm(prev => {
      const parts = path.split('.')
      if (parts.length === 1) return { ...prev, [path]: val }
      return { ...prev, [parts[0]]: { ...prev[parts[0]], [parts[1]]: val } }
    })
  }

  const autoLabel = () => {
    const w = form.when, r = form.require
    let lbl = ''
    if (w.pos_rank_req) lbl += w.pos_rank_req
    if (w.pos_branch)   lbl += (lbl ? ' ' : '') + w.pos_branch
    lbl += ' → '
    if (r.rank_min)              lbl += `ยศ≥${r.rank_min} `
    if (r.edu_exact)             lbl += `จบ${r.edu_exact} `
    if (r.edu_min)               lbl += `คุณวุฒิ≥${r.edu_min} `
    if (r.branch)                lbl += `สาย=${r.branch} `
    if (r.corps)                 lbl += `เหล่า=${r.corps} `
    if (r.origin)                lbl += `กำเนิด=${r.origin} `
    if (r.study_field)           lbl += `สาขา${r.study_field} `
    if (r.seniority_min_service) lbl += `อายุงาน≥${r.seniority_min_service}ปี `
    if (r.years_in_rank_min)     lbl += `อายุยศ≥${r.years_in_rank_min}ปี `
    if (r.lcht_max)              lbl += `ลชท.≤${r.lcht_max} `
    set('label', lbl.trim())
  }

  const inp = (label, path, options) => (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 3 }}>{label}</label>
      {options
        ? <select className="inp" value={path.split('.').reduce((o,k)=>o?.[k], form) || ''}
            onChange={e => set(path, e.target.value)}>
            <option value="">— ไม่กำหนด —</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        : <input className="inp" value={path.split('.').reduce((o,k)=>o?.[k], form) || ''}
            onChange={e => set(path, e.target.value)} placeholder="ไม่กำหนด" />
      }
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box">
        <div className="modal-head">
          <span>🔧 {rule ? 'แก้ไขกฎ IF-THEN' : 'เพิ่มกฎ IF-THEN ใหม่'}</span>
          <button className="cand-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '12px 16px' }}>
          {/* WHEN section */}
          <div className="rule-section">
            <div className="rule-section-title" style={{ color: '#0369a1' }}>
              🔵 IF — เงื่อนไขของตำแหน่ง (เมื่อตำแหน่งตรงกับข้อกำหนดด้านล่าง)
            </div>
            <div className="rule-grid">
              {inp('อัตราของตำแหน่ง', 'when.pos_rank_req', ['', ...RANK_LIST])}
              {inp('สาย/สธ.ของตำแหน่ง', 'when.pos_branch', ['', 'สธ.', '*', ''])}
              {inp('ระดับตำแหน่ง (03–29)', 'when.pos_level')}
              {inp('สถานะตำแหน่ง', 'when.pos_status', ['', '0', '1', '3'])}
            </div>
          </div>

          {/* REQUIRE section */}
          <div className="rule-section">
            <div className="rule-section-title" style={{ color: '#059669' }}>
              🟢 THEN — คุณสมบัติที่บุคคลต้องมี (ตรวจสอบทั้งหมดที่กำหนด)
            </div>
            <div className="rule-grid">
              {inp('ยศขั้นต่ำ (≥)', 'require.rank_min', ['', ...RANK_LIST])}
              {inp('ยศที่ต้องตรงพอดี (=)', 'require.rank_exact', ['', ...RANK_LIST])}
              {inp('คุณวุฒิขั้นต่ำ (≥)', 'require.edu_min', ['', ...EDU_LIST])}
              {inp('ต้องจบหลักสูตรนี้ (=)', 'require.edu_exact', ['', ...EDU_LIST])}
              {inp('สาย/สธ.ต้องตรง', 'require.branch', ['', 'สธ.', '*'])}
              {inp('เหล่าต้องตรง', 'require.corps')}
              {inp('กำเนิดต้องตรง', 'require.origin')}
              {inp('สาขาวิชาที่ต้องการ (keyword)', 'require.study_field', ['', ...STUDY_FIELDS])}
            </div>
          </div>

          {/* SENIORITY section */}
          <div className="rule-section">
            <div className="rule-section-title" style={{ color: '#7c3aed' }}>
              🟣 อาวุโส — เงื่อนไขด้านความอาวุโส / ปีรับราชการ
            </div>
            <div className="rule-grid">
              {inp('อายุงาน — รับราชการขั้นต่ำ (ปี) ≥', 'require.seniority_min_service')}
              {inp('อายุยศ — ครองยศปัจจุบันขั้นต่ำ (ปี) ≥', 'require.years_in_rank_min')}
              {inp('ลำดับ ลชท.หลัก ต้องไม่เกิน (≤)', 'require.lcht_max')}
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
              <strong>หมายเหตุ:</strong> ลชท. = ลำดับชั้นทหาร (น้อย = อาวุโสมากกว่า) · ปีรับราชการคำนวณจาก ปี พ.ศ. {CURRENT_BE} − ปีที่เข้ารับราชการ
            </div>
          </div>

          {/* Label */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 3 }}>
              ชื่อกฎ (แสดงในรายการ)
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="inp" value={form.label} onChange={e => set('label', e.target.value)}
                placeholder="ตั้งชื่อกฎนี้..." style={{ flex: 1 }} />
              <button className="btn btn-sec btn-sm" onClick={autoLabel}>สร้างอัตโนมัติ</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
            <button className="btn btn-sec" onClick={onClose}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={() => { if (!form.label) { alert('กรุณาตั้งชื่อกฎ'); return } onSave({ ...form, id: form.id || Date.now() }) }}>
              💾 บันทึกกฎ
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  VACANT SUGGESTIONS (inline spider-web node)
// ══════════════════════════════════════════════════════
function VacantSuggestions({ pos, conditions, positions, transferMap, onAssign, sortType = 'fit' }) {
  const top3 = useMemo(() => {
    return positions
      .filter(p =>
        p.name && p.status === '1' &&
        p._id !== pos._id &&
        !transferMap.outgoing[p._id]   // ยังไม่ถูกนำออก
      )
      .map(p => ({
        ...p,
        _viols: evalConditions(conditions, p, pos),
        _score: matchScore(p, pos, sortType),
      }))
      .sort((a, b) => (a._viols.length - b._viols.length) || (a._score - b._score))
      .slice(0, 3)
  }, [pos, conditions, positions, transferMap, sortType])

  if (top3.length === 0) return null

  return (
    <div className="vacant-suggestions">
      <div className="sug-header">
        <span className="sug-web-icon">🕸</span>
        <span className="sug-header-txt">ผู้มีคุณสมบัติ</span>
      </div>
      <div className="sug-nodes">
        {top3.map((c, i) => {
          const ok = c._viols.length === 0
          return (
            <div key={c._id} className={`sug-node ${ok ? 'sug-ok' : 'sug-warn'}`}
              style={{ animationDelay: `${i * 80}ms` }}>
              <div className="sug-node-thread" />
              <PersonAvatar name={c.name} rankReq={c.rank_req} size={32} violation={!ok} />
              <div className="sug-node-info">
                <div className="sug-node-name">{c.name.replace(/^(พล\.\S+|พ\.\S+|ร\.\S+|น\.\S+|จ\.\S+)\s*/, '')}</div>
                <div className="sug-node-rank">{c.rank_req}{!ok && <span className="sug-viol-dot">⚠</span>}</div>
              </div>
              <button className="sug-pick-btn" onClick={e => { e.stopPropagation(); onAssign(c, pos) }}
                title={ok ? 'เลือก' : `⚠ ${c._viols[0]}`}>
                {ok ? '✓' : '⚠'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  DATABASE TABLE VIEW (CRUD)
// ══════════════════════════════════════════════════════
const DB_COLS = [
  { key: 'id',             label: '#',           w: 45 },
  { key: 'pos_code',       label: 'รหัสตำแหน่ง', w: 110 },
  { key: 'position',       label: 'หน่วย/ตำแหน่ง', w: 200 },
  { key: 'rank_req',       label: 'อัตรา',       w: 75,  type: 'rank' },
  { key: 'name',           label: 'ชื่อ-สกุล',   w: 170 },
  { key: 'person_id',      label: 'เลขประจำตัว', w: 100 },
  { key: 'status',         label: 'สถานะ',       w: 80,  type: 'status' },
  { key: 'branch',         label: 'สาย',         w: 55 },
  { key: 'corps',          label: 'เหล่า',       w: 60 },
  { key: 'origin',         label: 'กำเนิด',      w: 80 },
  { key: 'education',      label: 'คุณวุฒิ',     w: 140, type: 'edu' },
  { key: 'study_field',    label: 'สาขาวิชา',    w: 130, type: 'study' },
  { key: 'level',          label: 'ระดับ',        w: 55 },
  { key: 'entry_be',       label: 'ปีบรรจุ',     w: 70,  num: true },
  { key: 'birth_be',       label: 'ปีเกิด',      w: 65,  num: true },
  { key: 'lcht_main',      label: 'ลชท.',        w: 55,  num: true },
  { key: 'years_service',  label: 'อายุงาน',     w: 65,  num: true },
  { key: 'years_in_rank',  label: 'อายุยศ',      w: 60,  num: true },
]

function DataTableView({ positions, updatePosition, deletePosition, addPosition, resetData }) {
  const [search,   setSearch]   = useState('')
  const [sortCol,  setSortCol]  = useState('id')
  const [sortDir,  setSortDir]  = useState('asc')
  const [editCell, setEditCell] = useState(null) // { _id, field }
  const [editVal,  setEditVal]  = useState('')
  const [showAdd,  setShowAdd]  = useState(false)
  const [newRow,   setNewRow]   = useState({})

  const filtered = useMemo(() => {
    let result = positions
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))
      )
    }
    return [...result].sort((a, b) => {
      let va = a[sortCol] ?? '', vb = b[sortCol] ?? ''
      if (typeof va === 'number' || typeof vb === 'number')
        return sortDir === 'asc' ? (Number(va)||0) - (Number(vb)||0) : (Number(vb)||0) - (Number(va)||0)
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
  }, [positions, search, sortCol, sortDir])

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const startEdit = (_id, field, val) => { setEditCell({ _id, field }); setEditVal(val ?? '') }
  const cancelEdit = () => setEditCell(null)
  const saveEdit = () => {
    if (!editCell) return
    let val = editVal
    const col = DB_COLS.find(c => c.key === editCell.field)
    if (col?.num) { const n = Number(val); if (!isNaN(n) && val !== '') val = n; else if (val === '') val = null }
    updatePosition(editCell._id, { [editCell.field]: val })
    setEditCell(null)
  }
  const handleKey = e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }

  const exportAll = () => {
    const hdr = DB_COLS.map(c => c.label)
    const rows = filtered.map(r => DB_COLS.map(c => `"${r[c.key] ?? ''}"`))
    const csv = [hdr.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ฐานข้อมูลตำแหน่ง.csv'; a.click()
  }

  const handleAdd = () => {
    if (!newRow.pos_code) { alert('กรุณากรอกรหัสตำแหน่ง'); return }
    addPosition({
      id: positions.length + 1,
      ...Object.fromEntries(DB_COLS.filter(c => c.key !== 'id').map(c => [c.key, c.num && newRow[c.key] ? Number(newRow[c.key]) : (newRow[c.key] || '')])),
      status: newRow.status || '0',
    })
    setNewRow({}); setShowAdd(false)
  }

  // ── render cell editor ─────────────────
  const renderEditor = (col) => {
    const props = { className: 'db-edit-inp', value: editVal, autoFocus: true, onBlur: saveEdit }
    if (col.type === 'status')
      return <select {...props} onChange={e => setEditVal(e.target.value)}>
        <option value="0">ว่าง</option><option value="1">บรรจุจริง</option><option value="3">ปิด</option>
      </select>
    if (col.type === 'rank')
      return <select {...props} onChange={e => setEditVal(e.target.value)}>
        <option value="">—</option>{RANK_LIST.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    if (col.type === 'edu')
      return <select {...props} onChange={e => setEditVal(e.target.value)}>
        <option value="">—</option>{EDU_LIST.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    if (col.type === 'study')
      return <select {...props} onChange={e => setEditVal(e.target.value)}>
        <option value="">—</option>{STUDY_FIELDS.map(r => <option key={r} value={r}>{r}</option>)}
        <option value="__custom">พิมพ์เอง...</option>
      </select>
    return <input {...props} onChange={e => setEditVal(e.target.value)} onKeyDown={handleKey} />
  }

  // ── render cell for Add modal ─────────────────
  const renderAddField = (col) => {
    const val = newRow[col.key] || ''
    const onChange = e => setNewRow(p => ({ ...p, [col.key]: e.target.value }))
    if (col.type === 'status')
      return <select className="inp" value={val || '0'} onChange={onChange}>
        <option value="0">ว่าง</option><option value="1">บรรจุจริง</option><option value="3">ปิด</option>
      </select>
    if (col.type === 'rank')
      return <select className="inp" value={val} onChange={onChange}>
        <option value="">—</option>{RANK_LIST.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    if (col.type === 'edu')
      return <select className="inp" value={val} onChange={onChange}>
        <option value="">—</option>{EDU_LIST.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    return <input className="inp" value={val} onChange={onChange} placeholder={col.label} />
  }

  const statusBadge = s => {
    const info = STATUS_INFO[s] || { label: s || '—', color: '#94a3b8' }
    return <span className="db-status-badge" style={{ '--sc': info.color }}>{info.label}</span>
  }

  return (
    <div className="db-container">
      {/* Toolbar */}
      <div className="db-toolbar">
        <div className="db-toolbar-left">
          <div className="search-wrap" style={{ width: 280 }}>
            <input placeholder="ค้นหา ชื่อ, รหัส, หน่วย, อัตรา..." value={search}
              onChange={e => setSearch(e.target.value)} className="inp" />
            <span className="search-ico">🔍</span>
          </div>
          <span className="db-count">
            แสดง <strong>{filtered.length}</strong> / {positions.length} ตำแหน่ง
          </span>
        </div>
        <div className="db-toolbar-right">
          <button className="btn btn-primary btn-sm" onClick={() => { setNewRow({}); setShowAdd(true) }}>
            ➕ เพิ่มตำแหน่ง
          </button>
          <button className="btn btn-sec btn-sm" style={{ background:'#166534', color:'white', border:'none' }} onClick={exportAll}>
            📊 ส่งออก CSV
          </button>
          <button className="btn btn-danger btn-sm" onClick={resetData}>🔄 รีเซ็ตข้อมูล</button>
        </div>
      </div>

      <div className="db-hint">💡 ดับเบิ้ลคลิกเซลล์เพื่อแก้ไข · แก้ไขแล้วกด Enter เพื่อบันทึก · ข้อมูลอัปเดตอัตโนมัติในหน้าปรับย้าย</div>

      {/* Table */}
      <div className="db-table-wrap">
        <table className="db-table">
          <thead>
            <tr>
              {DB_COLS.map(col => (
                <th key={col.key} style={{ minWidth: col.w }}
                  className={sortCol === col.key ? 'sorted' : ''}
                  onClick={() => toggleSort(col.key)}>
                  {col.label}
                  {sortCol === col.key && <span className="sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
              ))}
              <th style={{ width: 44 }}>ลบ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, ri) => (
              <tr key={row._id}
                className={row.status === '3' ? 'row-closed' : row.status === '0' ? 'row-vacant' : ''}>
                {DB_COLS.map(col => {
                  const isEditing = editCell?._id === row._id && editCell?.field === col.key
                  return (
                    <td key={col.key}
                      onDoubleClick={() => startEdit(row._id, col.key, row[col.key])}
                      className={isEditing ? 'editing' : ''}>
                      {isEditing
                        ? renderEditor(col)
                        : col.key === 'status'
                          ? statusBadge(row[col.key])
                          : (row[col.key] ?? '—')
                      }
                    </td>
                  )
                })}
                <td>
                  <button className="db-del-btn" onClick={() => deletePosition(row._id)} title="ลบ">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="empty" style={{ padding: 40 }}><div>🔍</div>ไม่พบข้อมูลที่ตรงกัน</div>
        )}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}>
          <div className="modal-box">
            <div className="modal-head">
              <span>➕ เพิ่มตำแหน่งใหม่</span>
              <button className="cand-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div style={{ padding: '14px 16px' }}>
              <div className="rule-grid">
                {DB_COLS.filter(c => c.key !== 'id').map(col => (
                  <div key={col.key} style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 2 }}>
                      {col.label}
                    </label>
                    {renderAddField(col)}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                <button className="btn btn-sec" onClick={() => setShowAdd(false)}>ยกเลิก</button>
                <button className="btn btn-primary" onClick={handleAdd}>💾 เพิ่มตำแหน่ง</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  ORG CHART — SINGLE POSITION NODE
// ══════════════════════════════════════════════════════
function OrgNode({ pos, getPersonForPos, transferMap, positions, conditions,
                   onDragStart, onDragEnd, onDrop, setDragOver, dragOver,
                   setCandidatePos, assignCandidateTo, sortType }) {
  const person   = getPersonForPos(pos)
  const incoming = !!transferMap.incoming[pos._id]
  const inPerson = incoming ? positions.find(p => p._id === transferMap.incoming[pos._id]) : null
  const isOut    = !!transferMap.outgoing[pos._id]
  const viols    = inPerson ? evalConditions(conditions, inPerson, pos) : []
  const isOver   = dragOver === pos._id
  const st       = getStatus(pos.status)
  const display  = person || (isOut ? pos : null)

  return (
    <div
      data-posid={pos._id}
      className={['org-node',
        pos.status === '0' ? 'vacant'      : '',
        pos.status === '3' ? 'closed'      : '',
        isOver            ? 'drop-over'   : '',
        viols.length      ? 'has-viol'    : '',
        isOut             ? 'is-leaving'  : '',
      ].filter(Boolean).join(' ')}
      onDragOver={e => { e.preventDefault(); setDragOver(pos._id) }}
      onDragLeave={() => setDragOver(null)}
      onDrop={e => onDrop(e, pos)}
      onClick={() => {
        if (!person && !incoming && pos.status !== '3')
          setCandidatePos(p => p?._id === pos._id ? null : pos)
      }}
    >
      <div className="org-status-dot" style={{ background: st.color }} />

      {/* ── Circular avatar ── */}
      <div className={['org-avatar-ring',
        viols.length ? 'viol'     : '',
        isOut        ? 'leaving'  : '',
        incoming     ? 'proposed' : '',
      ].filter(Boolean).join(' ')}
        draggable={!!display}
        onDragStart={display ? e => { e.stopPropagation(); onDragStart(e, isOut ? pos : person) } : undefined}
        onDragEnd={onDragEnd}
      >
        {display
          ? <PersonAvatar name={display.name} rankReq={display.rank_req} size={70}
              proposed={incoming} violation={viols.length > 0} showRing={incoming || isOut} />
          : <div className="org-avatar-plus">＋</div>
        }
      </div>

      {/* ── Text info ── */}
      <div className="org-node-name">
        {display ? display.name : <em className="org-vacant-lbl">ว่าง</em>}
      </div>
      <div className="org-node-title">{pos.position}</div>
      <div className="org-node-badges">
        {pos.rank_req && <Badge bg="#eff6ff" color="#1d4ed8">{pos.rank_req}</Badge>}
        {pos.branch && pos.branch !== '*' && <Badge bg="#f0fdf4" color="#166534">{pos.branch}</Badge>}
        {isOut     && <Badge bg="#fef3c7" color="#92400e">→ออก</Badge>}
        {incoming  && <Badge bg="#dcfce7" color="#166534">วางแผน</Badge>}
        {viols.length > 0 && <Badge bg="#fee2e2" color="#991b1b">⚠</Badge>}
      </div>
      {viols.length > 0 && <div className="org-node-viol">⚠ {viols[0]}</div>}

      {/* ── Inline suggestions ── */}
      {!person && !incoming && pos.status !== '3' && (
        <VacantSuggestions pos={pos} conditions={conditions} positions={positions}
          transferMap={transferMap} onAssign={assignCandidateTo} sortType={sortType} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  ORG CHART — ONE UNIT / DEPARTMENT TREE
// ══════════════════════════════════════════════════════
function UnitOrgTree({ unit, rows, nodeProps }) {
  const treeRef            = useRef(null)
  const [lines,   setLines]  = useState([])
  const [isOpen,  setIsOpen] = useState(true)

  /* group by RANK_LEVEL — highest rank at the top */
  const levels = useMemo(() => {
    const lMap = {}
    rows.forEach(pos => {
      const lv = RANK_LEVEL[pos.rank_req] ?? 0
      if (!lMap[lv]) lMap[lv] = []
      lMap[lv].push(pos)
    })
    return Object.entries(lMap)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([lv, poss]) => ({ level: Number(lv), poss }))
  }, [rows])

  /* recalculate bezier connector lines between rank levels */
  const recalcLines = useCallback(() => {
    const tree = treeRef.current
    if (!tree || levels.length < 2 || !isOpen) { setLines([]); return }
    const tRect = tree.getBoundingClientRect()
    const newLines = []
    for (let i = 0; i < levels.length - 1; i++) {
      const pp = levels[i].poss
      const cp = levels[i + 1].poss
      cp.forEach((child, ci) => {
        const pi = pp.length === 1 ? 0
          : Math.min(Math.floor(ci / cp.length * pp.length), pp.length - 1)
        const pEl = tree.querySelector(`[data-posid="${pp[pi]._id}"]`)
        const cEl = tree.querySelector(`[data-posid="${child._id}"]`)
        if (!pEl || !cEl) return
        const pR = pEl.getBoundingClientRect()
        const cR = cEl.getBoundingClientRect()
        newLines.push({
          x1: pR.left - tRect.left + pR.width  / 2,
          y1: pR.top  - tRect.top  + pR.height,
          x2: cR.left - tRect.left + cR.width  / 2,
          y2: cR.top  - tRect.top,
          mid: (pR.top - tRect.top + pR.height + cR.top - tRect.top) / 2,
        })
      })
    }
    setLines(newLines)
  }, [levels, isOpen])

  useEffect(() => {
    const raf = requestAnimationFrame(recalcLines)
    return () => cancelAnimationFrame(raf)
  }, [recalcLines])

  const uFilled = rows.filter(r => r.status === '1').length
  const uVacant = rows.filter(r => r.status === '0').length

  return (
    <div className="unit-tree-block">
      {/* Header — click to collapse */}
      <div className="unit-head" onClick={() => setIsOpen(p => !p)}>
        <span className="unit-icon">🏢</span>
        <span className="unit-name">{unit}</span>
        <span className="unit-stat green">{uFilled} บรรจุ</span>
        <span className="unit-stat yellow">{uVacant} ว่าง</span>
        <span className="unit-stat gray">{rows.length} รวม</span>
        <span className={`chevron ${isOpen ? 'open' : ''}`}>▾</span>
      </div>

      {isOpen && (
        <div className="unit-tree-body" ref={treeRef}>
          {/* SVG connector lines */}
          <svg style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 1, overflow: 'visible',
          }}>
            {lines.map((l, i) => (
              <path key={i}
                d={`M${l.x1},${l.y1} C${l.x1},${l.mid} ${l.x2},${l.mid} ${l.x2},${l.y2}`}
                stroke="#93c5fd" strokeWidth="2" fill="none" opacity="0.7" />
            ))}
          </svg>

          {/* Rank levels */}
          <div className="unit-tree-levels">
            {levels.map(({ level, poss }) => (
              <div key={level} className="orgchart-level">
                {poss.map(pos => (
                  <OrgNode key={pos._id} pos={pos} {...nodeProps} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  ORG CHART VIEW — wraps all unit trees
// ══════════════════════════════════════════════════════
function OrgChartView({ filteredGroups, nodeProps }) {
  return (
    <div className="orgchart-scroll">
      {Object.entries(filteredGroups).map(([unit, rows]) => (
        <UnitOrgTree key={unit} unit={unit} rows={rows} nodeProps={nodeProps} />
      ))}
      {Object.keys(filteredGroups).length === 0 && (
        <div className="empty" style={{ marginTop: 60, fontSize: 14 }}>
          <div style={{ fontSize: 40 }}>🔍</div>ไม่พบตำแหน่งที่ตรงกับเงื่อนไขการกรอง
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════
export default function App() {
  const [positions, setPositions] = useState(() => {
    const saved = localStorage.getItem('personnel-positions')
    const data = saved ? JSON.parse(saved) : rawData
    return data.map(r => ({ ...r, _id: r._id || `${r.pos_code}_${r.id}` }))
  })

  const [conditions,   setConditions]   = useState(DEFAULT_CONDITIONS)
  const [transfers,    setTransfers]    = useState([])
  const [sideTab,      setSideTab]      = useState('filter')
  const [collapsed,    setCollapsed]    = useState({})
  const [editingRule,  setEditingRule]  = useState(null)   // null | rule object
  const [showRuleModal,setShowRuleModal]= useState(false)
  const [showSimpleAdd,setShowSimpleAdd]= useState(false)
  const [newSimple,    setNewSimple]    = useState({ rule: 'branch_match', value: '', label: '' })

  // filters
  const [search,      setSearch]      = useState('')
  const [fStatus,     setFStatus]     = useState('all')
  const [fRank,       setFRank]       = useState('all')
  const [fUnit,       setFUnit]       = useState('all')
  const [boardSearch, setBoardSearch] = useState('')

  // candidate panel
  const [candidatePos, setCandidatePos] = useState(null)
  const [sortType,     setSortType]     = useState('fit')  // 'fit' | 'lcht' | 'service' | 'rank_age' | 'age'
  const [viewMode,     setViewMode]     = useState('board') // 'board' | 'orgchart'
  const [page,         setPage]         = useState('app')   // 'app' | 'database'

  // persist positions to localStorage
  useEffect(() => {
    localStorage.setItem('personnel-positions', JSON.stringify(positions))
  }, [positions])

  // drag
  const [draggingId, setDraggingId] = useState(null)
  const [dragOver,   setDragOver]   = useState(null)
  const ghostRef = useRef(null)

  // spider-web SVG overlay
  const boardScrollRef = useRef(null)
  const boardAreaRef   = useRef(null)
  const [webLines, setWebLines] = useState([])

  // ── derived transfer maps ──────────────────────────────────────────────────
  const transferMap = useMemo(() => {
    const incoming = {}, outgoing = {}
    transfers.forEach(t => { incoming[t.toId] = t.fromId; outgoing[t.fromId] = t.toId })
    return { incoming, outgoing }
  }, [transfers])

  const getPersonForPos = useCallback((pos) => {
    if (transferMap.outgoing[pos._id]) return null
    if (transferMap.incoming[pos._id])
      return positions.find(p => p._id === transferMap.incoming[pos._id]) || null
    return pos.status === '1' ? pos : null
  }, [transferMap, positions])

  // ── stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let filled = 0, vacant = 0, closed = 0
    positions.forEach(p => {
      if (p.status === '1') filled++
      else if (p.status === '0') vacant++
      else if (p.status === '3') closed++
    })
    return { filled, vacant, closed, planned: transfers.length }
  }, [positions, transfers])

  // ── unique values for filters ──────────────────────────────────────────────
  const uniqueRanks  = useMemo(() => [...new Set(positions.map(p => p.rank_req).filter(Boolean))].sort(), [positions])
  const uniqueUnits  = useMemo(() => [...new Set(positions.map(p => p.position).filter(Boolean))], [positions])
  const uniqueBranches = useMemo(() => [...new Set(positions.map(p => p.branch).filter(Boolean))].sort(), [positions])

  // ── grouped board ──────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const g = {}
    positions.forEach(p => { const u = p.position || 'ไม่ระบุ'; if (!g[u]) g[u] = []; g[u].push(p) })
    return g
  }, [positions])

  const filteredGroups = useMemo(() => {
    const result = {}
    Object.entries(grouped).forEach(([unit, rows]) => {
      if (fUnit !== 'all' && unit !== fUnit) return
      const filtered = rows.filter(r => {
        if (fStatus !== 'all' && r.status !== fStatus) return false
        if (fRank   !== 'all' && r.rank_req !== fRank) return false
        if (boardSearch) {
          const q = boardSearch.toLowerCase()
          if (!r.position.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false
        }
        return true
      })
      if (filtered.length) result[unit] = filtered
    })
    return result
  }, [grouped, fUnit, fStatus, fRank, boardSearch])

  // ── sidebar people ─────────────────────────────────────────────────────────
  const filteredPeople = useMemo(() =>
    positions.filter(p => {
      if (!p.name || p.status !== '1') return false
      if (search) {
        const q = search.toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !p.person_id.includes(q)) return false
      }
      return true
    }), [positions, search])

  // ── candidates for panel ───────────────────────────────────────────────────
  const candidates = useMemo(() => {
    if (!candidatePos) return []
    return positions
      .filter(p => p.name && p.status === '1' && p._id !== candidatePos._id)
      .map(p => {
        const viols = evalConditions(conditions, p, candidatePos)
        return { ...p, _viols: viols, _score: matchScore(p, candidatePos, sortType) + viols.length * 20 }
      })
      .sort((a, b) => a._score - b._score)
  }, [candidatePos, positions, conditions, sortType])

  // ── transfers with violation info ──────────────────────────────────────────
  const transfersInfo = useMemo(() => transfers.map(t => {
    const from = positions.find(p => p._id === t.fromId)
    const to   = positions.find(p => p._id === t.toId)
    const viols = from && to ? evalConditions(conditions, from, to) : []
    return { ...t, from, to, viols }
  }), [transfers, positions, conditions])

  const totalViols = transfersInfo.filter(t => t.viols.length > 0).length

  // ── drag handlers ──────────────────────────────────────────────────────────
  const onDragStart = useCallback((e, pos) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('posId', pos._id)
    setDraggingId(pos._id)
    const ghost = document.createElement('div')
    ghost.style.cssText = 'position:fixed;top:-9999px;background:white;border:2px solid #0d2d5e;border-radius:10px;padding:6px 12px;font-size:12px;font-weight:700;font-family:Sarabun,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.25);'
    ghost.textContent = '👤 ' + (pos.name || pos.position)
    document.body.appendChild(ghost)
    ghostRef.current = ghost
    e.dataTransfer.setDragImage(ghost, 0, 0)
  }, [])

  const onDragEnd = useCallback(() => {
    setDraggingId(null); setDragOver(null)
    if (ghostRef.current) { document.body.removeChild(ghostRef.current); ghostRef.current = null }
  }, [])

  const onDragOver = useCallback((e, id) => { e.preventDefault(); setDragOver(id) }, [])

  const onDrop = useCallback((e, targetPos) => {
    e.preventDefault(); setDragOver(null)
    const fromId = e.dataTransfer.getData('posId')
    if (!fromId || fromId === targetPos._id) return
    if (targetPos.status === '3') {
      const hasNoClose = conditions.some(c => c.enabled && c.type === 'simple' && c.rule === 'no_close')
      if (hasNoClose && !window.confirm('ตำแหน่งนี้ถูกปิด!\nต้องการดำเนินการต่อหรือไม่?')) return
    }
    setTransfers(prev => [...prev.filter(t => t.fromId !== fromId), { id: Date.now(), fromId, toId: targetPos._id }])
    setCandidatePos(null)
  }, [conditions])

  // กำหนดคนเข้าตำแหน่งที่ระบุ (ใช้ได้ทั้ง CandidatePanel และ inline VacantSuggestions)
  const assignCandidateTo = useCallback((person, targetPos) => {
    setTransfers(prev => [
      ...prev.filter(t => t.fromId !== person._id && t.toId !== targetPos._id),
      { id: Date.now(), fromId: person._id, toId: targetPos._id },
    ])
    setCandidatePos(null)
  }, [])

  const assignCandidate = (person) => {
    if (!candidatePos) return
    assignCandidateTo(person, candidatePos)
  }

  // คำนวณพิกัดเส้น web — พิกัด relative ต่อ board-area (SVG อยู่นอก scroll container)
  const recalcWebLines = useCallback(() => {
    const container = boardScrollRef.current
    const boardArea = boardAreaRef.current
    if (!container || !boardArea || transfers.length === 0) { setWebLines([]); return }
    const aRect = boardArea.getBoundingClientRect()
    const lines = []
    for (const t of transfers) {
      const fromEl = container.querySelector(`[data-posid="${t.fromId}"]`)
      const toEl   = container.querySelector(`[data-posid="${t.toId}"]`)
      if (!fromEl || !toEl) continue
      const fr = fromEl.getBoundingClientRect()
      const tr = toEl.getBoundingClientRect()
      const hasViol = (transfersInfo.find(ti => ti.id === t.id)?.viols?.length || 0) > 0
      lines.push({
        id: t.id,
        x1: fr.left - aRect.left + fr.width  / 2,
        y1: fr.top  - aRect.top  + fr.height / 2,
        x2: tr.left - aRect.left + tr.width  / 2,
        y2: tr.top  - aRect.top  + tr.height / 2,
        hasViol,
      })
    }
    setWebLines(lines)
  }, [transfers, transfersInfo])

  useEffect(() => {
    const raf = requestAnimationFrame(recalcWebLines)
    return () => cancelAnimationFrame(raf)
  }, [recalcWebLines, filteredGroups, collapsed])

  // ── condition management ───────────────────────────────────────────────────
  const toggleCond  = id => setConditions(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c))
  const removeCond  = id => setConditions(prev => prev.filter(c => c.id !== id))
  const saveRule    = (rule) => {
    setConditions(prev => {
      const exists = prev.find(c => c.id === rule.id)
      return exists ? prev.map(c => c.id === rule.id ? rule : c) : [...prev, rule]
    })
    setShowRuleModal(false); setEditingRule(null)
  }

  const addSimpleCond = () => {
    const labels = {
      branch_match: 'สาย/สธ.ต้องตรงกัน',
      rank_match:   'อัตราต้องตรงกัน',
      no_close:     'ห้ามบรรจุตำแหน่งปิด',
    }
    setConditions(prev => [...prev, { id: Date.now(), type: 'simple', rule: newSimple.rule, enabled: true, label: labels[newSimple.rule] || newSimple.rule }])
    setShowSimpleAdd(false)
    setNewSimple({ rule: 'branch_match', value: '', label: '' })
  }

  // props bundle for OrgNode / OrgChartView
  const nodeProps = {
    getPersonForPos, transferMap, positions, conditions,
    onDragStart, onDragEnd, onDrop, setDragOver,
    dragOver, setCandidatePos, assignCandidateTo, sortType,
  }

  const exportCSV = () => {
    const rows = [['ลำดับ','ชื่อ-สกุล','อัตรา','จากตำแหน่ง','ไปตำแหน่ง','รหัสตำแหน่ง','ฝ่าฝืนเงื่อนไข']]
    transfersInfo.forEach((t, i) => {
      rows.push([i+1, t.from?.name||'', t.from?.rank_req||'', t.from?.position||'', t.to?.position||'', t.to?.pos_code||'', t.viols.join('; ')])
    })
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'แผนปรับย้าย.csv'; a.click()
  }

  // ── CRUD for database table ──────────────────────────────────────────────────
  const updatePosition = useCallback((_id, updates) => {
    setPositions(prev => prev.map(p => p._id === _id ? { ...p, ...updates } : p))
  }, [])

  const deletePosition = useCallback((_id) => {
    if (!window.confirm('ลบตำแหน่งนี้?')) return
    setPositions(prev => prev.filter(p => p._id !== _id))
    setTransfers(prev => prev.filter(t => t.fromId !== _id && t.toId !== _id))
  }, [])

  const addPosition = useCallback((newPos) => {
    const _id = `${newPos.pos_code || 'NEW'}_${Date.now()}`
    setPositions(prev => [...prev, { ...newPos, _id }])
  }, [])

  const resetData = useCallback(() => {
    if (!window.confirm('รีเซ็ตข้อมูลทั้งหมดกลับเป็นค่าเริ่มต้น?\nข้อมูลที่แก้ไขจะหายไป')) return
    setPositions(rawData.map(r => ({ ...r, _id: `${r.pos_code}_${r.id}` })))
    setTransfers([])
    localStorage.removeItem('personnel-positions')
  }, [])

  // ══════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════
  return (
    <div className="app-root">

      {/* ── RULE MODAL ── */}
      {showRuleModal && (
        <RuleModal
          rule={editingRule}
          onSave={saveRule}
          onClose={() => { setShowRuleModal(false); setEditingRule(null) }}
          uniqueRanks={uniqueRanks}
          uniqueBranches={uniqueBranches}
        />
      )}

      {/* ── HEADER ── */}
      <header className="app-header">
        <div className="header-title">
          <div className="header-emblem">⚔️</div>
          <div>
            <div className="header-main">ระบบเตรียมการปรับย้ายกำลังพล</div>
            <div className="header-sub">กรมยุทธการทหาร · ยก.ทหาร · {new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' })}</div>
          </div>
        </div>
        <div className="header-nav">
          <button className={`nav-btn ${page === 'app' ? 'active' : ''}`}
            onClick={() => setPage('app')}>📋 ระบบปรับย้าย</button>
          <button className={`nav-btn ${page === 'database' ? 'active' : ''}`}
            onClick={() => setPage('database')}>🗃 ฐานข้อมูล ({positions.length})</button>
        </div>
        <div className="header-stats">
          {[
            { n: stats.filled,  l: 'บรรจุจริง', c: '#22c55e' },
            { n: stats.vacant,  l: 'ว่าง',       c: '#f59e0b' },
            { n: stats.closed,  l: 'ปิด',        c: '#ef4444' },
            { n: stats.planned, l: 'วางแผนย้าย', c: '#60a5fa' },
            ...(totalViols > 0 ? [{ n: totalViols, l: 'ฝ่าฝืน', c: '#f87171' }] : []),
          ].map(s => (
            <div key={s.l} className="stat-pill" style={{ '--c': s.c }}>
              <span className="stat-num">{s.n}</span>
              <span className="stat-lbl">{s.l}</span>
            </div>
          ))}
        </div>
      </header>

      <div className="app-body">
        {page === 'database' ? (
          <DataTableView
            positions={positions}
            updatePosition={updatePosition}
            deletePosition={deletePosition}
            addPosition={addPosition}
            resetData={resetData}
          />
        ) : <>
        {/* ── SIDEBAR ── */}
        <aside className="sidebar">
          <div className="sidebar-tabs">
            {[['filter','ตัวกรอง'],['conditions','เงื่อนไข'],['plan','แผนย้าย']].map(([k,l]) => (
              <button key={k} className={`stab ${sideTab===k?'active':''}`} onClick={() => setSideTab(k)}>
                {l}
                {k==='plan' && stats.planned > 0 && <span className="tab-badge">{stats.planned}</span>}
                {k==='conditions' && conditions.filter(c=>c.enabled).length > 0 &&
                  <span className="tab-badge" style={{ background:'#0369a1' }}>{conditions.filter(c=>c.enabled).length}</span>}
              </button>
            ))}
          </div>
          <div className="sidebar-body">

            {/* ── FILTER TAB ── */}
            {sideTab === 'filter' && <>
              <div className="sec-title">ค้นหากำลังพล</div>
              <div className="search-wrap">
                <input placeholder="ชื่อ หรือ เลขประจำตัว..." value={search}
                  onChange={e => setSearch(e.target.value)} className="inp" />
                <span className="search-ico">🔍</span>
              </div>
              <div className="sec-title">สถานภาพ</div>
              <div className="chip-row">
                {[['all','ทั้งหมด'],['1','บรรจุ'],['0','ว่าง'],['3','ปิด']].map(([v,l]) => (
                  <button key={v} className={`chip ${fStatus===v?'active':''}`} onClick={() => setFStatus(v)}>{l}</button>
                ))}
              </div>
              <div className="sec-title">อัตรา</div>
              <select className="inp" value={fRank} onChange={e => setFRank(e.target.value)}>
                <option value="all">ทุกอัตรา</option>
                {uniqueRanks.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <div className="sec-title" style={{ marginTop: 12 }}>
                กำลังพล ({filteredPeople.length} คน)
                <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 4, color: '#94a3b8' }}>ลากไปวางที่ตำแหน่ง</span>
              </div>
              <div className="people-list">
                {filteredPeople.slice(0, 100).map(p => {
                  const planned = !!transferMap.outgoing[p._id]
                  return (
                    <div key={p._id} className={`person-pill ${planned ? 'planned' : ''}`}
                      draggable onDragStart={e => onDragStart(e, p)} onDragEnd={onDragEnd}>
                      <PersonAvatar name={p.name} rankReq={p.rank_req} size={40} proposed={planned} />
                      <div className="person-pill-info">
                        <div className="person-pill-name">{p.name}</div>
                        <div className="person-pill-meta">
                          <Badge bg="#dbeafe" color="#1d4ed8">{p.rank_req}</Badge>
                          {p.corps && <Badge bg="#fce7f3" color="#9d174d">{p.corps}</Badge>}
                          {seniorityLabel(p) && <Badge bg="#f3e8ff" color="#6b21a8">{seniorityLabel(p)}</Badge>}
                          {planned && <Badge bg="#fef3c7" color="#92400e">วางแผนย้าย</Badge>}
                        </div>
                        <div className="person-pill-pos">📍 {p.position}</div>
                      </div>
                    </div>
                  )
                })}
                {filteredPeople.length > 100 && (
                  <div style={{ textAlign:'center', fontSize:11, color:'#94a3b8', padding:8 }}>
                    ...และอีก {filteredPeople.length - 100} คน
                  </div>
                )}
                {filteredPeople.length === 0 && <div className="empty"><div>👤</div>ไม่พบกำลังพล</div>}
              </div>
            </>}

            {/* ── CONDITIONS TAB ── */}
            {sideTab === 'conditions' && <>
              <div className="cond-info-box">
                <strong>🔧 ระบบเงื่อนไขแบบ IF-THEN</strong><br/>
                กำหนดกฎได้อิสระ เช่น<br/>
                <em>"ถ้าตำแหน่งเป็น พ.อ.(พ) สธ. → บุคคลต้องจบหลักสูตรเสนาธิการ และมียศ ≥ พ.อ."</em>
              </div>

              {/* Simple conditions */}
              <div className="cond-group-label">📌 เงื่อนไขทั่วไป</div>
              {conditions.filter(c => c.type === 'simple').map(c => (
                <CondRow key={c.id} c={c}
                  onToggle={() => toggleCond(c.id)}
                  onRemove={() => removeCond(c.id)}
                  onEdit={() => {}} />
              ))}
              {!showSimpleAdd
                ? <button className="btn-dashed" onClick={() => setShowSimpleAdd(true)}>+ เพิ่มเงื่อนไขทั่วไป</button>
                : <div className="add-cond-box">
                    <select className="inp" value={newSimple.rule} onChange={e => setNewSimple(p => ({...p, rule: e.target.value}))}>
                      <option value="rank_match">อัตราต้องตรงกัน</option>
                      <option value="branch_match">สาย/สธ.ต้องตรงกัน</option>
                      <option value="no_close">ห้ามบรรจุตำแหน่งปิด</option>
                    </select>
                    <div style={{ display:'flex', gap:6, marginTop:6 }}>
                      <button className="btn btn-primary btn-sm" onClick={addSimpleCond}>เพิ่ม</button>
                      <button className="btn btn-sec btn-sm" onClick={() => setShowSimpleAdd(false)}>ยกเลิก</button>
                    </div>
                  </div>
              }

              {/* Rule-based IF-THEN conditions */}
              <div className="cond-group-label" style={{ marginTop: 14 }}>⚙ กฎ IF-THEN (เงื่อนไขเฉพาะตำแหน่ง)</div>
              {conditions.filter(c => c.type === 'rule').map(c => (
                <CondRow key={c.id} c={c}
                  onToggle={() => toggleCond(c.id)}
                  onRemove={() => removeCond(c.id)}
                  onEdit={() => { setEditingRule(c); setShowRuleModal(true) }} />
              ))}
              {conditions.filter(c => c.type === 'rule').length === 0 && (
                <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>ยังไม่มีกฎ IF-THEN</div>
              )}

              {/* Presets */}
              <div className="preset-label">💡 Presets ที่ใช้บ่อย</div>
              <div className="preset-grid">
                {[
                  { label: 'พ.อ.(พ) สธ. → จบ สธ.+ยศ≥พ.อ.', when: { pos_rank_req: 'พ.อ.(พ)', pos_branch: 'สธ.' }, require: { edu_exact: 'หลักสูตรเสนาธิการ', rank_min: 'พ.อ.' } },
                  { label: 'พล.ต. → ยศ≥พ.อ. + จบ สธ.', when: { pos_rank_req: 'พล.ต.' }, require: { edu_exact: 'หลักสูตรเสนาธิการ', rank_min: 'พ.อ.' } },
                  { label: 'พล.ท. → จบ วปอ.', when: { pos_rank_req: 'พล.ท.' }, require: { edu_exact: 'วิทยาลัยป้องกันราชอาณาจักร' } },
                  { label: 'พ.อ. → ปริญญาโทขึ้นไป', when: { pos_rank_req: 'พ.อ.' }, require: { edu_min: 'ปริญญาโท' } },
                  { label: 'พ.อ.(พ) → อายุงาน ≥ 30 ปี', when: { pos_rank_req: 'พ.อ.(พ)' }, require: { seniority_min_service: '30' } },
                  { label: 'พล.ต. → อายุงาน ≥ 35 ปี', when: { pos_rank_req: 'พล.ต.' }, require: { seniority_min_service: '35' } },
                  { label: 'พล.ท. → อายุงาน ≥ 38 ปี', when: { pos_rank_req: 'พล.ท.' }, require: { seniority_min_service: '38' } },
                  { label: 'พ.อ.(พ) → อายุยศ ≥ 3 ปี', when: { pos_rank_req: 'พ.อ.(พ)' }, require: { years_in_rank_min: '3' } },
                  { label: 'พล.ต. → อายุยศ ≥ 2 ปี', when: { pos_rank_req: 'พล.ต.' }, require: { years_in_rank_min: '2' } },
                  { label: 'ตำแหน่งไอที → สาขาคอมพิวเตอร์', when: { pos_level: '' }, require: { study_field: 'คอมพิวเตอร์' } },
                  { label: 'บริหาร → สาขาบริหาร/รัฐศาสตร์', when: { pos_level: '' }, require: { study_field: 'บริหาร' } },
                ].map((p, i) => (
                  <button key={i} className="preset-btn" onClick={() => {
                    const exists = conditions.some(c => c.type==='rule' && c.label===p.label)
                    if (exists) { alert('กฎนี้มีอยู่แล้ว'); return }
                    setConditions(prev => [...prev, { id: Date.now(), type: 'rule', enabled: true, ...p }])
                  }}>
                    {p.label}
                  </button>
                ))}
              </div>

              <button className="btn btn-primary" style={{ width:'100%', marginTop:10 }}
                onClick={() => { setEditingRule(null); setShowRuleModal(true) }}>
                ➕ สร้างกฎ IF-THEN ใหม่
              </button>

              <div className="cond-hint" style={{ marginTop: 12 }}>
                <strong>วิธีใช้:</strong> เปิด/ปิดเงื่อนไขได้อิสระ<br/>
                ตำแหน่งที่ฝ่าฝืนกฎจะแสดง <span style={{ color:'#ef4444' }}>⚠</span> สีแดง<br/>
                กฎ IF-THEN ใช้เฉพาะตำแหน่งที่ตรงเงื่อนไข IF เท่านั้น
              </div>
            </>}

            {/* ── PLAN TAB ── */}
            {sideTab === 'plan' && <>
              <div className="plan-header">
                <span>แผนการปรับย้าย ({transfers.length})</span>
                {transfers.length > 0 && (
                  <button className="btn btn-danger btn-sm"
                    onClick={() => window.confirm('ล้างแผนทั้งหมด?') && setTransfers([])}>ล้างทั้งหมด</button>
                )}
              </div>
              {totalViols > 0 && (
                <div className="warn-box">⚠ พบการฝ่าฝืนเงื่อนไข {totalViols} รายการ</div>
              )}
              {transfersInfo.length === 0
                ? <div className="empty"><div>📋</div>ยังไม่มีแผนการปรับย้าย<br/>ลากรูปกำลังพลไปวางที่ตำแหน่ง</div>
                : transfersInfo.map((t, i) => (
                  <div key={t.id} className={`plan-item ${t.viols.length ? 'has-viol' : ''}`}>
                    <PersonAvatar name={t.from?.name} rankReq={t.from?.rank_req} size={44} violation={t.viols.length > 0} />
                    <div className="plan-info">
                      <div className="plan-name">{t.from?.name || '-'}</div>
                      <div className="plan-from">จาก: {t.from?.position}</div>
                      <div className="plan-to">→ {t.to?.position}</div>
                      {t.viols.map((v, vi) => <div key={vi} className="plan-viol">⚠ {v}</div>)}
                    </div>
                    <button className="plan-rm" onClick={() => setTransfers(p => p.filter(x => x.id !== t.id))}>✕</button>
                  </div>
                ))
              }
              {transfers.length > 0 && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className="btn btn-export" onClick={exportCSV}>📊 ส่งออก Excel (.csv)</button>
                  <button className="btn btn-sec" onClick={() => {
                    const txt = transfersInfo.map((t,i) =>
                      `${i+1}. ${t.from?.name}\n   จาก: ${t.from?.position}\n   ไป: ${t.to?.position}${t.viols.length ? '\n   ⚠ '+t.viols.join('; ') : ''}`
                    ).join('\n\n')
                    navigator.clipboard?.writeText(txt).then(() => alert('คัดลอกแล้ว'))
                  }}>📋 คัดลอกข้อความ</button>
                </div>
              )}
            </>}
          </div>
        </aside>

        {/* ── BOARD ── */}
        <main className="board-area" ref={boardAreaRef}>

          {/* ── WEB SVG OVERLAY (board mode only) ── */}
          {viewMode === 'board' && webLines.length > 0 && (
            <svg style={{
              position:'absolute', inset:0, width:'100%', height:'100%',
              pointerEvents:'none', zIndex:20, overflow:'hidden',
            }}>
              <defs>
                <marker id="wh-ok"   markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
                  <polygon points="0 0, 9 3.5, 0 7" fill="#3b82f6" opacity=".9" />
                </marker>
                <marker id="wh-viol" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
                  <polygon points="0 0, 9 3.5, 0 7" fill="#ef4444" opacity=".9" />
                </marker>
              </defs>
              {webLines.map(l => {
                const cx     = (l.x1 + l.x2) / 2
                const cy     = Math.min(l.y1, l.y2) - Math.abs(l.x2 - l.x1) * 0.28 - 40
                const color  = l.hasViol ? '#ef4444' : '#3b82f6'
                const marker = l.hasViol ? 'url(#wh-viol)' : 'url(#wh-ok)'
                const path   = `M${l.x1},${l.y1} Q${cx},${cy} ${l.x2},${l.y2}`
                return (
                  <g key={l.id}>
                    <path d={path} stroke="rgba(0,0,0,.1)" strokeWidth="6" fill="none" />
                    <path d={path} stroke={color} strokeWidth="2.5" fill="none" opacity=".9"
                      strokeDasharray="8 4" className="web-line-anim" markerEnd={marker} />
                    <path d={path} stroke={color} strokeWidth="8" fill="none" opacity=".1"
                      className="web-pulse-anim" />
                  </g>
                )
              })}
            </svg>
          )}

          <div className="board-toolbar">
            {/* View mode toggle */}
            <div className="view-toggle" title="เปลี่ยนมุมมอง">
              <button className={`view-btn ${viewMode === 'board' ? 'active' : ''}`}
                onClick={() => setViewMode('board')} title="มุมมองตาราง">⊞ ตาราง</button>
              <button className={`view-btn ${viewMode === 'orgchart' ? 'active' : ''}`}
                onClick={() => setViewMode('orgchart')} title="มุมมองแผนผังองค์กร">🏛 แผนผัง</button>
            </div>

            <div className="search-wrap" style={{ width: 210 }}>
              <input placeholder="ค้นหาตำแหน่ง / ชื่อ..." value={boardSearch}
                onChange={e => setBoardSearch(e.target.value)} className="inp" />
              <span className="search-ico">🔍</span>
            </div>
            <select className="inp" style={{ width: 200 }} value={fUnit} onChange={e => setFUnit(e.target.value)}>
              <option value="all">ทุกหน่วย ({positions.length} ตำแหน่ง)</option>
              {uniqueUnits.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            {viewMode === 'board' && (
              <button className="btn btn-sec btn-sm" onClick={() => {
                const all = Object.keys(filteredGroups), anyOpen = all.some(u => !collapsed[u])
                setCollapsed(Object.fromEntries(all.map(u => [u, anyOpen])))
              }}>▾ ย่อ/ขยาย</button>
            )}
            {stats.planned > 0 && (
              <button className="btn btn-primary btn-sm" onClick={() => setSideTab('plan')}>
                📋 ดูแผน ({stats.planned})
                {totalViols > 0 && ` ⚠${totalViols}`}
              </button>
            )}
          </div>

          {viewMode === 'orgchart'
            ? <OrgChartView filteredGroups={filteredGroups} nodeProps={nodeProps} />
            : null}

          <div className="board-scroll" ref={boardScrollRef} onScroll={recalcWebLines}
            style={{ display: viewMode === 'board' ? undefined : 'none' }}>
            {Object.entries(filteredGroups).map(([unit, rows]) => {
              const isOpen  = !collapsed[unit]
              const uFilled = rows.filter(r => r.status === '1').length
              const uVacant = rows.filter(r => r.status === '0').length

              return (
                <div key={unit} className="unit-block">
                  <div className="unit-head" onClick={() => setCollapsed(p => ({ ...p, [unit]: !p[unit] }))}>
                    <span className="unit-icon">🏢</span>
                    <span className="unit-name">{unit}</span>
                    <span className="unit-stat green">{uFilled} บรรจุ</span>
                    <span className="unit-stat yellow">{uVacant} ว่าง</span>
                    <span className="unit-stat gray">{rows.length} รวม</span>
                    <span className={`chevron ${isOpen ? 'open' : ''}`}>▾</span>
                  </div>

                  {isOpen && (
                    <div className="pos-grid">
                      {rows.map(pos => {
                        const person       = getPersonForPos(pos)
                        const incoming     = !!transferMap.incoming[pos._id]
                        const inPerson     = incoming ? positions.find(p => p._id === transferMap.incoming[pos._id]) : null
                        const isOut        = !!transferMap.outgoing[pos._id]
                        const viols        = inPerson ? evalConditions(conditions, inPerson, pos) : []
                        const isOver       = dragOver === pos._id
                        const isCTarget    = candidatePos?._id === pos._id
                        const st           = getStatus(pos.status)

                        return (
                          <div key={pos._id}
                            data-posid={pos._id}
                            className={['pos-card',
                              pos.status==='0'?'vacant':'',
                              pos.status==='3'?'closed':'',
                              isOver?'drop-over':'',
                              isCTarget?'candidate-target':'',
                              viols.length?'has-violation':'',
                            ].filter(Boolean).join(' ')}
                            onDragOver={e => onDragOver(e, pos._id)}
                            onDragLeave={() => setDragOver(null)}
                            onDrop={e => onDrop(e, pos)}
                            onClick={() => { if (!person && pos.status !== '3') setCandidatePos(prev => prev?._id === pos._id ? null : pos) }}
                          >
                            <div className="pos-card-top">
                              <span className="pos-dot" style={{ background: st.color }} title={st.label} />
                              <span className="pos-code-txt">{pos.pos_code}</span>
                              {viols.length > 0 && <span className="viol-badge">⚠</span>}
                            </div>
                            <div className="pos-title">{pos.position}</div>
                            <div className="pos-reqs">
                              {pos.rank_req && <Badge bg="#eff6ff" color="#1d4ed8">{pos.rank_req}</Badge>}
                              {pos.branch && pos.branch !== '*' && <Badge bg="#f0fdf4" color="#166534">{pos.branch}</Badge>}
                            </div>
                            <div
                              className={`avatar-zone ${(!person && !isOut && pos.status==='0') ? 'vacant-zone' : ''} ${isOver?'over':''}`}
                              draggable={!!person}
                              onDragStart={person ? e => onDragStart(e, person) : undefined}
                              onDragEnd={onDragEnd}
                            >
                              {person ? (
                                // ── บุคคลปัจจุบัน (ไม่ออก) ──────────────────
                                <>
                                  <PersonAvatar name={person.name} rankReq={person.rank_req} size={64}
                                    proposed={incoming} violation={viols.length > 0} showRing={incoming} />
                                  <div className="person-name-txt">{person.name}</div>
                                  <div className="person-meta-txt">
                                    <Badge bg="#dbeafe" color="#1d4ed8">{person.rank_req}</Badge>
                                    {person.corps && <Badge bg="#fce7f3" color="#9d174d">{person.corps}</Badge>}
                                    {seniorityLabel(person) && <Badge bg="#f3e8ff" color="#6b21a8">{seniorityLabel(person)}</Badge>}
                                    {incoming && <Badge bg="#fef9c3" color="#92400e">วางแผน</Badge>}
                                  </div>
                                  {viols.length > 0 && <div className="viol-text">⚠ {viols[0]}</div>}
                                </>
                              ) : isOut && pos.status === '1' ? (
                                // ── บุคคลกำลังออก (cascade) ────────────────
                                <div className="out-leaving-zone" draggable
                                  onDragStart={e => onDragStart(e, pos)} onDragEnd={onDragEnd}>
                                  <PersonAvatar name={pos.name} rankReq={pos.rank_req} size={52}
                                    proposed={false} violation={false} showRing={true} />
                                  <div className="person-name-txt out-leaving-name">{pos.name}</div>
                                  <div className="out-arrow-badge">→ กำลังออก</div>
                                </div>
                              ) : pos.status === '3' ? (
                                // ── ปิด ─────────────────────────────────────
                                <div className="closed-tag">🔒 ปิด</div>
                              ) : (
                                // ── ว่าง ─────────────────────────────────────
                                <div className="vacant-tag">
                                  {isOver ? '📌 วางที่นี่' : (<>
                                    <div className="vacant-icon">＋</div>
                                    <div>ว่าง</div>
                                    <div className="vacant-hint">คลิกเพื่อดูผู้มีคุณสมบัติ</div>
                                  </>)}
                                </div>
                              )}
                            </div>

                            {/* ── INLINE SUGGESTIONS (ใยแมงมุม cascade) ── */}
                            {/* แสดงทั้งตำแหน่งว่างและตำแหน่งที่คนกำลังออก */}
                            {!person && !incoming && pos.status !== '3' && (
                              <VacantSuggestions
                                pos={pos}
                                conditions={conditions}
                                positions={positions}
                                transferMap={transferMap}
                                onAssign={assignCandidateTo}
                                sortType={sortType}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {Object.keys(filteredGroups).length === 0 && (
              <div className="empty" style={{ marginTop: 60, fontSize: 14 }}>
                <div style={{ fontSize: 40 }}>🔍</div>ไม่พบตำแหน่งที่ตรงกับเงื่อนไขการกรอง
              </div>
            )}
          </div>
        </main>

        {/* ── CANDIDATE PANEL ── */}
        <div className={`candidate-panel ${candidatePos ? 'open' : ''}`}>
          <div className="cand-header">
            <div>
              <div className="cand-title">👥 ผู้มีคุณสมบัติเหมาะสม</div>
              <div className="cand-pos-name">{candidatePos?.position}</div>
              <div style={{ display:'flex', gap:4, marginTop:4, flexWrap:'wrap' }}>
                {candidatePos?.rank_req && <Badge bg="#eff6ff" color="#1d4ed8">{candidatePos.rank_req}</Badge>}
                {candidatePos?.branch && candidatePos.branch !== '*' && <Badge bg="#f0fdf4" color="#166534">{candidatePos.branch}</Badge>}
              </div>
            </div>
            <button className="cand-close" onClick={() => setCandidatePos(null)}>✕</button>
          </div>

          {/* active conditions for this position */}
          {candidatePos && (() => {
            const activeRules = conditions.filter(c => c.enabled && c.type === 'rule' && posMatchWhen(candidatePos, c.when))
            return activeRules.length > 0 ? (
              <div className="cand-rules-box">
                <div style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>⚙ กฎที่ใช้กับตำแหน่งนี้</div>
                {activeRules.map(r => (
                  <div key={r.id} style={{ fontSize: 10, color: '#475569', padding: '2px 0', borderLeft: '2px solid #bae6fd', paddingLeft: 6, marginBottom: 3 }}>
                    {r.label}
                  </div>
                ))}
              </div>
            ) : null
          })()}

          <div className="cand-sort-bar">
            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>เรียงโดย:</span>
            {[
              { k: 'fit',      icon: '🎯', label: 'คุณสมบัติ' },
              { k: 'lcht',     icon: '🏅', label: 'ลชท.' },
              { k: 'service',  icon: '⏳', label: 'อายุงาน' },
              { k: 'rank_age', icon: '⭐', label: 'อายุยศ' },
              { k: 'age',      icon: '🎂', label: 'อายุตัว' },
            ].map(s => (
              <button key={s.k}
                className={`sort-chip ${sortType === s.k ? 'active' : ''}`}
                onClick={() => setSortType(s.k)}
              >{s.icon} {s.label}</button>
            ))}
          </div>

          <div className="cand-legend">
            <span className="legend-dot green" />บรรจุได้ทันที &nbsp;
            <span className="legend-dot yellow" />มีข้อจำกัด &nbsp;
            <span className="legend-dot red" />ฝ่าฝืนกฎ
          </div>

          <div className="cand-list">
            {candidates.length === 0 && <div className="empty"><div>🔎</div>ไม่พบผู้มีคุณสมบัติ</div>}
            {candidates.slice(0, 60).map(c => {
              const hasViol = c._viols.length > 0
              const picked  = !!transferMap.outgoing[c._id]
              return (
                <div key={c._id} className={`cand-card ${hasViol?'cand-viol':'cand-ok'} ${picked?'cand-picked':''}`}
                  draggable onDragStart={e => { onDragStart(e, c); setCandidatePos(null) }} onDragEnd={onDragEnd}>
                  <PersonAvatar name={c.name} rankReq={c.rank_req} size={52} violation={hasViol} />
                  <div className="cand-info">
                    <div className="cand-name">{c.name}</div>
                    <div className="cand-meta">
                      <Badge bg="#dbeafe" color="#1d4ed8">{c.rank_req}</Badge>
                      {c.corps  && <Badge bg="#fce7f3" color="#9d174d">{c.corps}</Badge>}
                      {c.origin && <Badge bg="#fff7ed" color="#9a3412">{c.origin}</Badge>}
                    </div>
                    <div className="cand-seniority-row">
                      {c.lcht_main  != null && <span className="sen-tag lcht">🏅 ลชท.{c.lcht_main}</span>}
                      {c.years_service != null && <span className={`sen-tag svc ${sortType==='service'?'hi':''}`}>⏳ {c.years_service}ปีงาน</span>}
                      {c.years_in_rank != null && <span className={`sen-tag rnk ${sortType==='rank_age'?'hi':''}`}>⭐ ยศ {c.years_in_rank}ปี</span>}
                      {getAge(c) != null && <span className={`sen-tag age ${sortType==='age'?'hi':''}`}>🎂 {getAge(c)}ปี</span>}
                    </div>
                    <div className="cand-edu">
                      {c.education}
                      {c.study_field && <span className="study-tag"> · {c.study_field}</span>}
                    </div>
                    <div className="cand-cur">📍 {c.position}</div>
                    {c._viols.map((v,vi) => <div key={vi} className="cand-viol-text">⚠ {v}</div>)}
                    {picked && <div style={{ fontSize:10, color:'#f59e0b', fontWeight:700 }}>⚡ มีแผนย้ายอยู่แล้ว</div>}
                  </div>
                  <button className={`btn-assign ${hasViol?'warn':''}`} onClick={() => assignCandidate(c)}>เลือก</button>
                </div>
              )
            })}
          </div>
        </div>
        </>}
      </div>
    </div>
  )
}
