import { useRef, useEffect, useCallback } from 'react'
import { TabulatorFull as Tabulator } from 'tabulator-tables'
import 'tabulator-tables/dist/css/tabulator.min.css'

// ── constants (same as App.jsx) ────────────────────────
const RANK_LIST = [
  'จ.ส.ต.','จ.ส.ท.','จ.ส.อ.',
  'ร.ต.','ร.ท.','ร.อ.',
  'น.ต.','น.ท.','น.อ.',
  'พ.ต.','พ.ท.','พ.อ.','พ.อ.(พ)',
  'พล.ต.','พล.ท.','พล.อ.',
  'พล.ร.ต.','พล.ร.ท.','พล.ร.อ.',
  'พล.อ.ต.','พล.อ.ท.','พล.อ.อ.',
]

const EDU_LIST = [
  'ประกาศนียบัตรวิชาชีพ','ปริญญาตรี','ปริญญาโท','ปริญญาเอก',
  'หลักสูตรเสนาธิการ','วิทยาลัยป้องกันราชอาณาจักร',
]

const STUDY_FIELDS = [
  'คอมพิวเตอร์','เทคโนโลยีสารสนเทศ','วิศวกรรมคอมพิวเตอร์',
  'บริหารธุรกิจ','การจัดการ','รัฐศาสตร์','รัฐประศาสนศาสตร์',
  'นิติศาสตร์','เศรษฐศาสตร์','บัญชี','การเงิน',
  'วิศวกรรมศาสตร์','วิทยาศาสตร์','สังคมศาสตร์',
  'ภาษาต่างประเทศ','การสื่อสาร','สาธารณสุข',
]

// ── rank → salary level mapping (ตามตารางเงินเดือน 1 มี.ค.60) ──
const RANK_TO_SALARY = {
  // ส.1 — สิบตรี / จ่าตรี / จ่าอากาศตรี
  'ส.ต.': 'ส.1', 'จ.ต.': 'ส.1',
  // ส.2 — สิบโท, สิบเอก / จ่าโท, จ่าเอก / จ่าอากาศโท, จ่าอากาศเอก
  'ส.ท.': 'ส.2', 'ส.อ.': 'ส.2', 'จ.ท.': 'ส.2', 'จ.อ.': 'ส.2',
  // ป.1 — จ่าสิบตรี / พันจ่าตรี / พันจ่าอากาศตรี
  'จ.ส.ต.': 'ป.1',
  // ป.2 — จ่าสิบโท / พันจ่าโท / พันจ่าอากาศโท
  'จ.ส.ท.': 'ป.2',
  // ป.3 — จ่าสิบเอก, จ่าสิบเอก(พ) / พันจ่าเอก / พันจ่าอากาศเอก
  'จ.ส.อ.': 'ป.3', 'จ.ส.อ.(พ)': 'ป.3',
  // น.1 — ร้อยตรี / เรือตรี / เรืออากาศตรี
  'ร.ต.': 'น.1',
  // น.2 — ร้อยโท / เรือโท / เรืออากาศโท
  'ร.ท.': 'น.2',
  // น.3 — ร้อยเอก / เรือเอก / เรืออากาศเอก
  'ร.อ.': 'น.3',
  // น.4 — พันตรี / นาวาตรี / นาวาอากาศตรี
  'พ.ต.': 'น.4', 'น.ต.': 'น.4',
  // น.5 — พันโท / นาวาโท / นาวาอากาศโท
  'พ.ท.': 'น.5', 'น.ท.': 'น.5',
  // น.6 — พันเอก / นาวาเอก / นาวาอากาศเอก
  'พ.อ.': 'น.6', 'น.อ.': 'น.6',
  // น.7 — พันเอก(พิเศษ)
  'พ.อ.(พ)': 'น.7',
  // น.8 — พลตรี / พลเรือตรี / พลอากาศตรี
  'พล.ต.': 'น.8', 'พล.ร.ต.': 'น.8', 'พล.อ.ต.': 'น.8',
  // น.9 — พลโท, พลเอก / พลเรือโท, พลเรือเอก / พลอากาศโท, พลอากาศเอก
  'พล.ท.': 'น.9', 'พล.ร.ท.': 'น.9', 'พล.อ.ท.': 'น.9',
  'พล.อ.': 'น.9', 'พล.ร.อ.': 'น.9', 'พล.อ.อ.': 'น.9',
  // ประจำ
  'ประจำ (สัญญาบัตร)': 'ประจำ (น.)',
  'ประจำ (ประทวน)': 'ประจำ (ป.)',
}

// reverse: salary level → list of rank_req values
const SALARY_TO_RANKS = {}
for (const [rank, sal] of Object.entries(RANK_TO_SALARY)) {
  if (!SALARY_TO_RANKS[sal]) SALARY_TO_RANKS[sal] = []
  SALARY_TO_RANKS[sal].push(rank)
}

// ระดับเงินเดือนตามตารางเงินเดือน พร้อมรายละเอียดชั้นยศ
const SALARY_LEVELS = [
  { value: 'พ.',   label: 'พ. — พลทหาร' },
  { value: 'ส.1',  label: 'ส.1 — สิบตรี/จ่าตรี' },
  { value: 'ส.2',  label: 'ส.2 — สิบโท,สิบเอก/จ่าโท,จ่าเอก' },
  { value: 'ป.1',  label: 'ป.1 — จ่าสิบตรี/พันจ่าตรี' },
  { value: 'ป.2',  label: 'ป.2 — จ่าสิบโท/พันจ่าโท' },
  { value: 'ป.3',  label: 'ป.3 — จ่าสิบเอก/พันจ่าเอก' },
  { value: 'ประจำ (ป.)', label: 'ประจำ (ป.) — ประทวน' },
  { value: 'น.1',  label: 'น.1 — ร้อยตรี/เรือตรี' },
  { value: 'น.2',  label: 'น.2 — ร้อยโท/เรือโท' },
  { value: 'น.3',  label: 'น.3 — ร้อยเอก/เรือเอก' },
  { value: 'น.4',  label: 'น.4 — พันตรี/นาวาตรี' },
  { value: 'น.5',  label: 'น.5 — พันโท/นาวาโท' },
  { value: 'น.6',  label: 'น.6 — พันเอก/นาวาเอก' },
  { value: 'น.7',  label: 'น.7 — พันเอก(พ)' },
  { value: 'น.8',  label: 'น.8 — พลตรี/พลเรือตรี/พลอากาศตรี' },
  { value: 'น.9',  label: 'น.9 — พลโท,พลเอก/พลเรือโท,เอก' },
  { value: 'ประจำ (น.)', label: 'ประจำ (น.) — สัญญาบัตร' },
]

function rankToSalary(rank) {
  return RANK_TO_SALARY[rank] || rank || '—'
}

// ── status formatter ────────────────────────────────────
function statusFormatter(cell) {
  const v = cell.getValue()
  const map = {
    '1': ['บรรจุจริง', '#22c55e'],
    '0': ['ว่าง',      '#f59e0b'],
    '3': ['ปิด',       '#ef4444'],
  }
  const [label, color] = map[v] || [v || '—', '#94a3b8']
  return `<span style="
    background:${color}18;color:${color};
    border:1px solid ${color}40;
    padding:2px 10px;border-radius:12px;
    font-size:10px;font-weight:700
  ">${label}</span>`
}

// ══════════════════════════════════════════════════════════
//  TABULATOR VIEW
// ══════════════════════════════════════════════════════════
export default function TabulatorView({ positions, updatePosition, deletePosition, addPosition, resetData }) {
  const elRef       = useRef(null)
  const tableRef    = useRef(null)
  const skipSync    = useRef(false)

  // ── init Tabulator ────────────────────────────────────
  useEffect(() => {
    if (!elRef.current) return

    // salary level filter values
    const salaryFilterValues = { '': '— ทั้งหมด —', ...Object.fromEntries(SALARY_LEVELS.map(s => [s.value, s.label])) }
    // editor: show all ranks grouped by salary level
    const dataRanks = positions.map(p => p.rank_req).filter(Boolean)
    const allRanks = [...new Set([...RANK_LIST, ...dataRanks])]

    const table = new Tabulator(elRef.current, {
      data: positions.map(p => ({ ...p })),
      height: '100%',
      layout: 'fitDataFill',
      responsiveLayout: false,
      movableColumns: true,
      clipboard: true,
      pagination: true,
      paginationSize: 50,
      paginationCounter: 'rows',
      paginationSizeSelector: [20, 50, 100, 200, true],
      placeholder: '<div style="padding:40px;color:#94a3b8;font-size:14px">🔍 ไม่พบข้อมูล</div>',
      selectableRows: true,
      rowHeight: 36,

      columns: [
        // ── Delete button ──
        {
          title: '', field: '_del', width: 42, frozen: true,
          headerSort: false, hozAlign: 'center', resizable: false,
          formatter: () => '<span style="color:#ef4444;cursor:pointer;font-size:15px" title="ลบแถวนี้">✕</span>',
          cellClick: (_e, cell) => {
            const d = cell.getRow().getData()
            if (window.confirm(`ลบ "${d.pos_code || d.name || 'ตำแหน่งนี้'}"?`)) {
              skipSync.current = true
              cell.getRow().delete()
              deletePosition(d._id, true)
              setTimeout(() => { skipSync.current = false }, 100)
            }
          },
        },

        // ── Data columns ──
        { title: '#',             field: 'id',        width: 48,  editor: false, sorter: 'number' },
        { title: 'รหัสตำแหน่ง',    field: 'pos_code',  width: 130, editor: 'input', headerFilter: 'input', headerFilterPlaceholder: 'ค้นหา...' },
        { title: 'หน่วย/ตำแหน่ง',  field: 'position',  width: 210, editor: 'input', headerFilter: 'input', headerFilterPlaceholder: 'ค้นหา...' },
        {
          title: 'ระดับเงินเดือน', field: 'rank_req', width: 120,
          editor: 'list',
          editorParams: { values: allRanks, autocomplete: true, listOnEmpty: true, freetext: true },
          formatter: (cell) => {
            const v = cell.getValue()
            return `<span title="${v || ''}">${rankToSalary(v)}</span>`
          },
          headerFilter: 'list',
          headerFilterParams: { values: salaryFilterValues },
          headerFilterFunc: (headerValue, rowValue) => {
            if (!headerValue) return true
            const ranks = SALARY_TO_RANKS[headerValue] || []
            return ranks.includes(rowValue)
          },
        },
        { title: 'ชื่อ-สกุล',   field: 'name',       width: 190, editor: 'input', headerFilter: 'input', headerFilterPlaceholder: 'ค้นหา...' },
        { title: 'เลขประจำตัว', field: 'person_id',  width: 115, editor: 'input', headerFilter: 'input', headerFilterPlaceholder: 'ค้นหา...' },
        {
          title: 'สถานะ', field: 'status', width: 100, hozAlign: 'center',
          editor: 'list',
          editorParams: { values: { '1': 'บรรจุจริง', '0': 'ว่าง', '3': 'ปิด' } },
          headerFilter: 'list',
          headerFilterParams: { values: { '': '— ทั้งหมด —', '1': 'บรรจุจริง', '0': 'ว่าง', '3': 'ปิด' } },
          formatter: statusFormatter,
        },
        { title: 'สาย',    field: 'branch', width: 60,  editor: 'input', headerFilter: 'input', headerFilterPlaceholder: '...' },
        { title: 'เหล่า',   field: 'corps',  width: 65,  editor: 'input', headerFilter: 'input', headerFilterPlaceholder: '...' },
        { title: 'กำเนิด',  field: 'origin', width: 85,  editor: 'input' },
        {
          title: 'คุณวุฒิ', field: 'education', width: 160,
          editor: 'list',
          editorParams: { values: EDU_LIST, autocomplete: true, listOnEmpty: true, freetext: true },
          headerFilter: 'input', headerFilterPlaceholder: 'ค้นหา...',
        },
        {
          title: 'สาขาวิชา', field: 'study_field', width: 140,
          editor: 'list',
          editorParams: { values: STUDY_FIELDS, autocomplete: true, listOnEmpty: true, freetext: true },
          headerFilter: 'input', headerFilterPlaceholder: 'ค้นหา...',
        },
        { title: 'ระดับ',   field: 'level',          width: 60,  editor: 'input' },
        { title: 'ปีบรรจุ',  field: 'entry_be',       width: 80,  editor: 'number', hozAlign: 'center', sorter: 'number' },
        { title: 'ปีเกิด',  field: 'birth_be',       width: 75,  editor: 'number', hozAlign: 'center', sorter: 'number' },
        { title: 'ลชท.',    field: 'lcht_main',      width: 60,  editor: 'number', hozAlign: 'center', sorter: 'number' },
        { title: 'อายุงาน', field: 'years_service',  width: 75,  editor: 'number', hozAlign: 'center', sorter: 'number' },
        { title: 'อายุยศ',  field: 'years_in_rank',  width: 70,  editor: 'number', hozAlign: 'center', sorter: 'number' },
      ],

      // ── sync edited cell → React state ──
      cellEdited: (cell) => {
        skipSync.current = true
        const row = cell.getRow().getData()
        updatePosition(row._id, { [cell.getField()]: cell.getValue() })
        setTimeout(() => { skipSync.current = false }, 100)
      },
    })

    tableRef.current = table
    return () => { table.destroy(); tableRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── sync external changes (e.g. reset) back to table ──
  useEffect(() => {
    if (skipSync.current || !tableRef.current) return
    tableRef.current.replaceData(positions.map(p => ({ ...p })))
  }, [positions])

  // ── add row ──
  const handleAdd = useCallback(() => {
    const newPos = {
      id: positions.length + 1,
      pos_code: '', position: '', rank_req: '', name: '',
      person_id: '', status: '0', branch: '', corps: '',
      origin: '', education: '', study_field: '', level: '',
      entry_be: null, birth_be: null, lcht_main: null,
      years_service: null, years_in_rank: null,
    }
    addPosition(newPos)
  }, [positions.length, addPosition])

  // ── export ──
  const handleExport = useCallback(() => {
    tableRef.current?.download('csv', 'ฐานข้อมูลตำแหน่ง.csv', { bom: true })
  }, [])

  return (
    <div className="tabview-container">
      <div className="tabview-toolbar">
        <div className="tabview-toolbar-left">
          <span className="tabview-title">📊 Tabulator — แก้ไขข้อมูลได้โดยตรงในแถว</span>
          <span className="db-count">{positions.length} ตำแหน่ง</span>
        </div>
        <div className="tabview-toolbar-right">
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>➕ เพิ่มแถว</button>
          <button className="btn btn-sec btn-sm" style={{ background: '#166534', color: 'white', border: 'none' }}
            onClick={handleExport}>📊 ส่งออก CSV</button>
          <button className="btn btn-danger btn-sm" onClick={resetData}>🔄 รีเซ็ต</button>
        </div>
      </div>
      <div className="tabview-hint">
        💡 <strong>คลิกเซลล์</strong>เพื่อแก้ไขทันที · พิมพ์ในช่อง<strong>ตัวกรอง</strong>ที่หัวคอลัมน์ · คลิกหัวคอลัมน์เพื่อ<strong>เรียงลำดับ</strong> · กด <strong>✕</strong> เพื่อลบแถว
      </div>
      <div ref={elRef} className="tabview-table" />
    </div>
  )
}
