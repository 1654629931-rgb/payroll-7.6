;(function () {
  'use strict'

  const APP_VERSION = 1
  const STORAGE_KEY = 'acct_payroll_spa_v1'

  const $ = (selector, root = document) => root.querySelector(selector)
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector))

  const deepClone = (value) => JSON.parse(JSON.stringify(value))

  function uid() {
    return (
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`
    )
  }

  function todayISO() {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  function currentMonth() {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    return `${yyyy}-${mm}`
  }

  function parseAmount(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 2,
    }).format(Number(value || 0))
  }

  function escapeCSV(value) {
    const text = String(value ?? '')
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }

  function downloadText(filename, content, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2500)
  }

  function defaultData() {
    return {
      version: APP_VERSION,
      categories: [],
      employees: [],
      projects: [],
      monthAdjustments: {},
      monthLocks: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return defaultData()
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return defaultData()
      return normalizeState(parsed)
    } catch {
      return defaultData()
    }
  }

  function normalizeState(input) {
    const base = defaultData()

    const categories = Array.isArray(input.categories)
      ? input.categories.map((c) => ({
          id: c.id || uid(),
          name: String(c.name || '').trim() || '未命名分类',
          mode: c.mode === 'rate' ? 'rate' : 'fixed',
          value: parseAmount(c.value),
        }))
      : []

    const employees = Array.isArray(input.employees)
      ? input.employees.map((e) => ({
          id: e.id || uid(),
          name: String(e.name || '').trim() || '未命名员工',
          role: String(e.role || ''),
          baseSalary: parseAmount(e.baseSalary),
          phone: String(e.phone || ''),
          note: String(e.note || ''),
        }))
      : []

    const projects = Array.isArray(input.projects)
      ? input.projects.map((p) => ({
          id: p.id || uid(),
          month: /^\d{4}-\d{2}$/.test(p.month) ? p.month : currentMonth(),
          name: String(p.name || '').trim() || '未命名项目',
          categoryId: p.categoryId || (categories[0] ? categories[0].id : ''),
          amount: parseAmount(p.amount),
          startDate: p.startDate ? String(p.startDate) : '',
          endDate: p.endDate ? String(p.endDate) : '',
          hours: parseAmount(p.hours),
          status: p.status === 'completed' ? 'completed' : 'in_progress',
          compliancePassed: Boolean(p.compliancePassed),
          settled: Boolean(p.settled),
          ruleMode: p.ruleMode === 'rate' ? 'rate' : 'fixed',
          ruleValue: parseAmount(p.ruleValue),
          participants: Array.isArray(p.participants)
            ? p.participants
                .map((r) => ({
                  id: r.id || uid(),
                  employeeId: r.employeeId || '',
                  mode: r.mode === 'fixed' ? 'fixed' : 'ratio',
                  value: parseAmount(r.value),
                }))
                .filter((r) => r.employeeId)
            : [],
          createdAt: p.createdAt || new Date().toISOString(),
          updatedAt: p.updatedAt || new Date().toISOString(),
        }))
      : []

    const monthAdjustments = input.monthAdjustments && typeof input.monthAdjustments === 'object'
      ? input.monthAdjustments
      : {}

    const monthLocks = input.monthLocks && typeof input.monthLocks === 'object' ? input.monthLocks : {}

    return {
      version: APP_VERSION,
      categories,
      employees,
      projects,
      monthAdjustments,
      monthLocks,
      createdAt: input.createdAt || base.createdAt,
      updatedAt: input.updatedAt || new Date().toISOString(),
    }
  }

  function saveState(nextState) {
    nextState.updatedAt = new Date().toISOString()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
  }

  const ui = {
    route: 'workbench',
    month: currentMonth(),
    projectFilterEmployee: 'all',
    projectFilterStatus: 'all',
    projectFilterKeyword: '',
    expandedEmployees: new Set(),
    selectedEmployees: new Set(),
  }

  let state = loadState()

  const els = {
    navButtons: $$('.nav-btn'),
    views: {
      workbench: $('#view-workbench'),
      settings: $('#view-settings'),
      help: $('#view-help'),
    },
    monthInput: $('#wb-month'),
    lockToggle: $('#wb-lock-toggle'),
    exportBackup: $('#wb-export-backup'),
    importBackup: $('#wb-import-backup'),
    summary: $('#wb-summary'),
    addProject: $('#wb-add-project'),
    exportCSV: $('#wb-export-csv'),
    filterEmployee: $('#filter-employee'),
    filterStatus: $('#filter-status'),
    filterKeyword: $('#filter-keyword'),
    projectBody: $('#project-tbody'),
    salaryBody: $('#salary-tbody'),
    categoryBody: $('#category-tbody'),
    employeeBody: $('#employee-tbody'),
    employeeSelectAll: $('#employee-select-all'),
    batchDeleteEmployees: $('#cfg-batch-delete-employees'),
    addCategory: $('#cfg-add-category'),
    addEmployee: $('#cfg-add-employee'),
    clearData: $('#settings-clear'),
    modalRoot: $('#modal-root'),
    modalTitle: $('#modal-title'),
    modalBody: $('#modal-body'),
  }

  function isMonthLocked(month) {
    return Boolean(state.monthLocks?.[month])
  }

  function setMonthLocked(month, locked) {
    const nextState = deepClone(state)
    nextState.monthLocks = nextState.monthLocks || {}
    nextState.monthLocks[month] = locked
    state = nextState
    saveState(state)
    renderAll()
  }

  function getMonthAdjust(employeeId, month) {
    const monthBlock = state.monthAdjustments?.[month]
    const existing = monthBlock?.[employeeId]
    const employee = state.employees.find((item) => item.id === employeeId)

    return {
      baseSalary: parseAmount(existing?.baseSalary ?? employee?.baseSalary ?? 0),
      attendance: parseAmount(existing?.attendance ?? 0),
      socialInsurance: parseAmount(existing?.socialInsurance ?? 0),
    }
  }

  function setMonthAdjust(employeeId, month, patch) {
    const nextState = deepClone(state)
    nextState.monthAdjustments = nextState.monthAdjustments || {}
    nextState.monthAdjustments[month] = nextState.monthAdjustments[month] || {}
    const current = nextState.monthAdjustments[month][employeeId] || {}
    nextState.monthAdjustments[month][employeeId] = {
      ...current,
      ...patch,
    }
    state = nextState
    saveState(state)
    renderWorkbench()
  }

  function getCategoryById(categoryId) {
    return state.categories.find((item) => item.id === categoryId) || null
  }

  function getEmployeeById(employeeId) {
    return state.employees.find((item) => item.id === employeeId) || null
  }

  function getEmployeeLinkedProjects(employeeId) {
    return state.projects.filter((project) =>
      project.participants.some((participant) => participant.employeeId === employeeId),
    )
  }

  function getEmployeeRiskProjects(employeeId) {
    return getEmployeeLinkedProjects(employeeId).filter(
      (project) => project.status === 'in_progress' || !project.settled,
    )
  }

  function deleteEmployees(employeeIds) {
    const ids = [...new Set(employeeIds)].filter(Boolean)
    if (!ids.length) return

    const targetEmployees = state.employees.filter((employee) => ids.includes(employee.id))
    if (!targetEmployees.length) return

    const namesText =
      targetEmployees.length === 1
        ? `员工“${targetEmployees[0].name}”`
        : `${targetEmployees.length} 名员工`

    const confirmPrimary = window.confirm(
      `确认删除${namesText}吗？删除后关联数据将受影响，请确认继续。`,
    )
    if (!confirmPrimary) return

    const riskProjects = targetEmployees.flatMap((employee) =>
      getEmployeeRiskProjects(employee.id).map((project) => ({
        employeeName: employee.name,
        projectName: project.name,
      })),
    )

    if (riskProjects.length) {
      const preview = riskProjects
        .slice(0, 4)
        .map((item) => `${item.employeeName} / ${item.projectName}`)
        .join('、')

      const confirmSecondary = window.confirm(
        `该员工存在进行中 / 未结算项目，确认删除后项目将保留但失去关联，是否继续？${
          preview ? `\n涉及：${preview}${riskProjects.length > 4 ? ' 等' : ''}` : ''
        }`,
      )
      if (!confirmSecondary) return
    }

    const nextState = deepClone(state)
    nextState.employees = nextState.employees.filter((employee) => !ids.includes(employee.id))
    nextState.projects = nextState.projects.map((project) => ({
      ...project,
      participants: project.participants.filter((participant) => !ids.includes(participant.employeeId)),
      updatedAt: ids.some((id) => project.participants.some((p) => p.employeeId === id))
        ? new Date().toISOString()
        : project.updatedAt,
    }))

    if (nextState.monthAdjustments) {
      Object.keys(nextState.monthAdjustments).forEach((month) => {
        const monthBlock = nextState.monthAdjustments[month]
        if (!monthBlock) return
        ids.forEach((id) => {
          delete monthBlock[id]
        })
      })
    }

    ids.forEach((id) => {
      ui.selectedEmployees.delete(id)
      ui.expandedEmployees.delete(id)
    })

    state = normalizeState(nextState)
    saveState(state)
    renderAll()
  }

  function getProjectCommissionBase(project) {
    const amount = parseAmount(project.amount)
    const mode = project.ruleMode
    const value = parseAmount(project.ruleValue)
    if (mode === 'rate') return amount * value * 0.01
    return value
  }

  function getProjectParticipantCommission(project, participant) {
    const base = getProjectCommissionBase(project)
    if (participant.mode === 'fixed') return parseAmount(participant.value)
    return base * parseAmount(participant.value) * 0.01
  }

  function isProjectEligibleForPayroll(project) {
    // 合保未通过时禁止计发提成；完成后进入工资汇总；结算仅用于“锁定”
    return project.status === 'completed' && project.compliancePassed
  }

  function getProjectCommissionAllocations(project) {
    const allocations = project.participants.map((participant) => {
      const employee = getEmployeeById(participant.employeeId)
      return {
        participant,
        employeeName: employee ? employee.name : '未知员工',
        amount: getProjectParticipantCommission(project, participant),
      }
    })

    const total = allocations.reduce((sum, item) => sum + item.amount, 0)
    const base = getProjectCommissionBase(project)
    const ratioSum = project.participants
      .filter((p) => p.mode !== 'fixed')
      .reduce((sum, p) => sum + parseAmount(p.value), 0)

    return { allocations, total, base, ratioSum }
  }

  function getEmployeeCommissionItems(employeeId, month) {
    return state.projects
      .filter((project) => project.month === month && isProjectEligibleForPayroll(project))
      .flatMap((project) => {
        const category = getCategoryById(project.categoryId)
        return project.participants
          .filter((p) => p.employeeId === employeeId)
          .map((participant) => ({
            projectId: project.id,
            projectName: project.name,
            categoryName: category ? category.name : '未分类',
            status: project.status,
            settled: project.settled,
            amount: getProjectParticipantCommission(project, participant),
            mode: participant.mode,
            value: participant.value,
          }))
      })
      .sort((a, b) => b.amount - a.amount)
  }

  function computeEmployeePayroll(employeeId, month) {
    const adjust = getMonthAdjust(employeeId, month)
    const commissionItems = getEmployeeCommissionItems(employeeId, month)
    const commissionTotal = commissionItems.reduce((sum, item) => sum + item.amount, 0)
    const netPay = adjust.baseSalary + commissionTotal + adjust.attendance - adjust.socialInsurance

    return {
      adjust,
      commissionItems,
      commissionTotal,
      netPay,
    }
  }

  function computeWorkbenchSummary(month) {
    const employeeCount = state.employees.length

    const monthProjects = state.projects.filter((p) => p.month === month)
    const completedProjectCount = monthProjects.filter((p) => p.status === 'completed').length

    const baseTotal = state.employees.reduce((sum, employee) => {
      const adjust = getMonthAdjust(employee.id, month)
      return sum + adjust.baseSalary
    }, 0)

    const commissionTotal = monthProjects
      .filter((p) => isProjectEligibleForPayroll(p))
      .reduce((sum, project) => {
        return (
          sum +
          project.participants.reduce(
            (projectSum, participant) => projectSum + getProjectParticipantCommission(project, participant),
            0,
          )
        )
      }, 0)

    const shouldPayTotal = state.employees.reduce((sum, employee) => {
      return sum + computeEmployeePayroll(employee.id, month).netPay
    }, 0)

    return {
      employeeCount,
      completedProjectCount,
      baseTotal,
      commissionTotal,
      shouldPayTotal,
    }
  }

  function renderSummary(month) {
    const summary = computeWorkbenchSummary(month)
    const locked = isMonthLocked(month)

    els.summary.innerHTML = [
      renderSummaryCard('员工总人数', `${summary.employeeCount} 人`),
      renderSummaryCard('当月已完成项目数', `${summary.completedProjectCount} 项`),
      renderSummaryCard('当月基本工资总额', formatCurrency(summary.baseTotal)),
      renderSummaryCard('当月提成总额', formatCurrency(summary.commissionTotal)),
      renderSummaryCard('当月应发工资总额', formatCurrency(summary.shouldPayTotal), true),
    ].join('')

    els.lockToggle.textContent = locked ? '解除锁定' : '锁定当月'
    els.lockToggle.className = locked ? 'btn btn-danger' : 'btn btn-secondary'
  }

  function renderSummaryCard(label, value, highlight = false) {
    return `
      <div class="summary-card ${highlight ? 'highlight' : ''}">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `
  }

  function renderEmployeeFilterOptions() {
    if (
      ui.projectFilterEmployee !== 'all' &&
      !state.employees.some((employee) => employee.id === ui.projectFilterEmployee)
    ) {
      ui.projectFilterEmployee = 'all'
    }

    const options = [
      `<option value="all">全部员工</option>`,
      ...state.employees.map((employee) => `<option value="${employee.id}">${employee.name}</option>`),
    ]
    els.filterEmployee.innerHTML = options.join('')
    els.filterEmployee.value = ui.projectFilterEmployee
  }

  function getFilteredProjects(month) {
    let list = state.projects.filter((p) => p.month === month)

    if (ui.projectFilterEmployee !== 'all') {
      list = list.filter((project) =>
        project.participants.some((p) => p.employeeId === ui.projectFilterEmployee),
      )
    }

    if (ui.projectFilterStatus === 'in_progress') {
      list = list.filter((project) => project.status === 'in_progress')
    } else if (ui.projectFilterStatus === 'completed') {
      list = list.filter((project) => project.status === 'completed' && !project.settled)
    } else if (ui.projectFilterStatus === 'settled') {
      list = list.filter((project) => project.settled)
    }

    if (ui.projectFilterKeyword.trim()) {
      const kw = ui.projectFilterKeyword.trim().toLowerCase()
      list = list.filter((project) => project.name.toLowerCase().includes(kw))
    }

    return list.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  function renderProjects(month) {
    const locked = isMonthLocked(month)
    const projects = getFilteredProjects(month)

    if (!projects.length) {
      els.projectBody.innerHTML = `
        <tr>
          <td colspan="11">
            <div class="hint">本月暂无符合条件的项目。你可以点击右上角“新增项目”开始登记。</div>
          </td>
        </tr>
      `
      return
    }

    els.projectBody.innerHTML = projects
      .map((project) => {
        const category = getCategoryById(project.categoryId)
        const categoryName = category ? category.name : '未分类'
        const employeesText = project.participants
          .map((p) => {
            const employee = getEmployeeById(p.employeeId)
            if (!employee) return '未知员工'
            const suffix = p.mode === 'fixed' ? `固定${formatCurrency(p.value)}` : `${p.value}%`
            return `${employee.name}(${suffix})`
          })
          .join('、')

        const { base, total, ratioSum } = getProjectCommissionAllocations(project)

        const completionChip = project.status === 'completed' ? chip('已完成', 'orange') : chip('进行中', 'gray')
        const settlementChip = project.settled ? chip('已结算', 'green') : chip('未结算', 'gray')
        const complianceChip = project.compliancePassed ? chip('合保通过', 'green') : chip('合保未通过', 'red')

        const canEdit = !locked && !project.settled
        const canToggleStatus = !locked && !project.settled
        const canToggleCompliance = !locked && !project.settled
        const canSettle = !locked && project.status === 'completed' && project.compliancePassed

        const ratioWarning =
          project.participants.some((p) => p.mode !== 'fixed') && Math.abs(ratioSum - 100) > 0.001
            ? `<div class="chip orange" title="比例合计建议为 100%">比例合计 ${ratioSum}%</div>`
            : ''

        const commissionDisplay = isProjectEligibleForPayroll(project) ? formatCurrency(total) : formatCurrency(0)
        const commissionHint = project.ruleMode === 'rate'
          ? `${project.ruleValue}% × ${formatCurrency(project.amount)} = ${formatCurrency(base)}`
          : `固定 ${formatCurrency(project.ruleValue)}`

        return `
          <tr>
            <td>
              <div><strong>${project.name}</strong></div>
              <div class="muted">${commissionHint}</div>
            </td>
            <td>${categoryName}</td>
            <td class="num">${formatCurrency(project.amount)}</td>
            <td>
              <div>${employeesText || '-'}</div>
              ${ratioWarning}
            </td>
            <td>${project.startDate || '-'}</td>
            <td>${project.endDate || '-'}</td>
            <td class="num">${project.hours ? project.hours : '-'}</td>
            <td>
              ${completionChip}
            </td>
            <td>
              ${settlementChip}
              <div class="muted">${complianceChip}</div>
            </td>
            <td class="num">${commissionDisplay}</td>
            <td class="actions">
              <div class="actions-group">
                <button class="btn btn-ghost btn-small" data-action="project-edit" data-id="${project.id}" ${
                  canEdit ? '' : 'disabled'
                }>编辑</button>
                <button class="btn btn-secondary btn-small" data-action="project-toggle-status" data-id="${project.id}" ${
                  canToggleStatus ? '' : 'disabled'
                }>${project.status === 'completed' ? '设为进行中' : '标记完成'}</button>
                <button class="btn btn-ghost btn-small" data-action="project-toggle-compliance" data-id="${project.id}" ${
                  canToggleCompliance ? '' : 'disabled'
                }>${project.compliancePassed ? '取消合保' : '合保通过'}</button>
                <button class="btn btn-primary btn-small" data-action="project-settle" data-id="${project.id}" ${
                  canSettle ? '' : 'disabled'
                }>${project.settled ? '已结算' : '结算锁定'}</button>
                <button class="btn btn-danger btn-small" data-action="project-delete" data-id="${project.id}" ${
                  canEdit ? '' : 'disabled'
                }>删除</button>
              </div>
            </td>
          </tr>
        `
      })
      .join('')
  }

  function chip(text, color) {
    return `<span class="chip ${color}">${text}</span>`
  }

  function renderSalaries(month) {
    const locked = isMonthLocked(month)

    if (!state.employees.length) {
      els.salaryBody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="hint">还没有员工档案。请先到“基础配置”新增员工。</div>
          </td>
        </tr>
      `
      return
    }

    els.salaryBody.innerHTML = state.employees
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((employee) => {
        const payroll = computeEmployeePayroll(employee.id, month)
        const expanded = ui.expandedEmployees.has(employee.id)
        const nameCell = `<span class="link" data-action="salary-toggle" data-id="${employee.id}">${employee.name}</span>`

        const baseInput = `
          <input class="salary-input" data-action="salary-base" data-id="${employee.id}" type="number" inputmode="decimal" value="${payroll.adjust.baseSalary}" ${
            locked ? 'disabled' : ''
          } />
        `
        const attendanceInput = `
          <input class="salary-input" data-action="salary-attendance" data-id="${employee.id}" type="number" inputmode="decimal" value="${payroll.adjust.attendance}" ${
            locked ? 'disabled' : ''
          } />
        `
        const socialInput = `
          <input class="salary-input" data-action="salary-social" data-id="${employee.id}" type="number" inputmode="decimal" value="${payroll.adjust.socialInsurance}" ${
            locked ? 'disabled' : ''
          } />
        `

        const detailRow = expanded
          ? renderSalaryDetailsRow(employee, month, payroll.commissionItems)
          : ''

        return `
          <tr>
            <td>${nameCell}</td>
            <td class="num">${baseInput}</td>
            <td class="num">${formatCurrency(payroll.commissionTotal)}</td>
            <td class="num">${attendanceInput}</td>
            <td class="num">${socialInput}</td>
            <td class="num"><strong>${formatCurrency(payroll.netPay)}</strong></td>
          </tr>
          ${detailRow}
        `
      })
      .join('')
  }

  function renderSalaryDetailsRow(employee, month, commissionItems) {
    if (!commissionItems.length) {
      return `
        <tr class="salary-details">
          <td colspan="6">
            <div class="detail-list">
              <div class="hint">本月暂无已完成且合保通过的项目提成。</div>
            </div>
          </td>
        </tr>
      `
    }

    const items = commissionItems
      .map((item) => {
        const statusChip = item.settled ? chip('已结算', 'green') : chip('未结算', 'orange')
        const formula = item.mode === 'fixed' ? `固定 ${formatCurrency(item.value)}` : `比例 ${item.value}%`

        return `
          <div class="detail-item">
            <div>
              <strong>${item.projectName}</strong>
              <p>${item.categoryName} · ${formula} · ${statusChip}</p>
            </div>
            <div class="detail-right">${formatCurrency(item.amount)}</div>
          </div>
        `
      })
      .join('')

    return `
      <tr class="salary-details">
        <td colspan="6">
          <div class="detail-list">
            ${items}
          </div>
        </td>
      </tr>
    `
  }

  function renderCategories() {
    if (!state.categories.length) {
      els.categoryBody.innerHTML = `
        <tr><td colspan="4"><div class="hint">暂无项目分类，请点击右上角“新增分类”。</div></td></tr>
      `
      return
    }

    els.categoryBody.innerHTML = state.categories
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((category) => {
        const modeText = category.mode === 'rate' ? '按项目金额比例' : '固定金额'
        const valueText = category.mode === 'rate' ? `${category.value}%` : formatCurrency(category.value)

        return `
          <tr>
            <td><strong>${category.name}</strong></td>
            <td>${modeText}</td>
            <td class="num">${valueText}</td>
            <td class="actions">
              <div class="actions-group">
                <button class="btn btn-ghost btn-small" data-action="category-edit" data-id="${category.id}">编辑</button>
                <button class="btn btn-danger btn-small" data-action="category-delete" data-id="${category.id}">删除</button>
              </div>
            </td>
          </tr>
        `
      })
      .join('')
  }

  function renderEmployees() {
    if (!state.employees.length) {
      ui.selectedEmployees.clear()
      if (els.employeeSelectAll) els.employeeSelectAll.checked = false
      if (els.batchDeleteEmployees) {
        els.batchDeleteEmployees.disabled = true
        els.batchDeleteEmployees.textContent = '批量删除'
      }
      els.employeeBody.innerHTML = `
        <tr><td colspan="5"><div class="hint">暂无员工，请先在基础配置中添加。</div></td></tr>
      `
      return
    }

    const validIds = new Set(state.employees.map((employee) => employee.id))
    ui.selectedEmployees.forEach((id) => {
      if (!validIds.has(id)) ui.selectedEmployees.delete(id)
    })

    const allSelected = state.employees.length > 0 && state.employees.every((employee) => ui.selectedEmployees.has(employee.id))
    if (els.employeeSelectAll) els.employeeSelectAll.checked = allSelected
    if (els.batchDeleteEmployees) {
      els.batchDeleteEmployees.disabled = ui.selectedEmployees.size === 0
      els.batchDeleteEmployees.textContent =
        ui.selectedEmployees.size > 0 ? `批量删除（${ui.selectedEmployees.size}）` : '批量删除'
    }

    els.employeeBody.innerHTML = state.employees
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((employee) => {
        return `
          <tr>
            <td class="checkbox-col">
              <input
                type="checkbox"
                data-action="employee-select"
                data-id="${employee.id}"
                ${ui.selectedEmployees.has(employee.id) ? 'checked' : ''}
                aria-label="选择员工 ${employee.name}"
              />
            </td>
            <td><strong>${employee.name}</strong></td>
            <td>${employee.role || '-'}</td>
            <td class="num">${formatCurrency(employee.baseSalary)}</td>
            <td class="actions">
              <div class="actions-group">
                <button class="btn btn-ghost btn-small" data-action="employee-edit" data-id="${employee.id}">编辑</button>
                <button class="btn btn-danger btn-small" data-action="employee-delete" data-id="${employee.id}">删除</button>
              </div>
            </td>
          </tr>
        `
      })
      .join('')
  }

  function setRoute(route) {
    ui.route = route
    els.navButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.route === route))
    Object.entries(els.views).forEach(([key, el]) => el.classList.toggle('is-active', key === route))
  }

  function openModal(title, contentHTML, onSubmit) {
    els.modalTitle.textContent = title
    els.modalBody.innerHTML = contentHTML
    els.modalRoot.hidden = false

    const form = $('form', els.modalBody)
    if (form && onSubmit) {
      form.addEventListener('submit', (event) => {
        event.preventDefault()
        const formData = new FormData(form)
        onSubmit(formData)
      })
    }
  }

  function closeModal() {
    els.modalRoot.hidden = true
    els.modalBody.innerHTML = ''
  }

  function openCategoryModal(category) {
    const isEditing = Boolean(category)
    const initial = category || { id: '', name: '', mode: 'fixed', value: 0 }

    openModal(
      isEditing ? '编辑项目分类' : '新增项目分类',
      `
        <form class="modal-form">
          <div class="form-grid">
            <label class="field span-2">
              <span>分类名称</span>
              <input name="name" required value="${escapeHTML(initial.name)}" placeholder="例如：理账、审计、报税" />
            </label>
            <label class="field">
              <span>计提方式</span>
              <select name="mode">
                <option value="fixed" ${initial.mode === 'fixed' ? 'selected' : ''}>固定金额提成</option>
                <option value="rate" ${initial.mode === 'rate' ? 'selected' : ''}>项目金额比例提成</option>
              </select>
            </label>
            <label class="field">
              <span>默认值（金额或%）</span>
              <input name="value" type="number" inputmode="decimal" value="${initial.value}" />
            </label>
          </div>
          <div class="divider"></div>
          <div class="toolbar" style="justify-content:flex-end">
            <button type="button" class="btn btn-ghost" data-action="close">取消</button>
            <button type="submit" class="btn btn-primary">${isEditing ? '保存' : '新增'}</button>
          </div>
        </form>
      `,
      (formData) => {
        const name = String(formData.get('name') || '').trim()
        const mode = formData.get('mode') === 'rate' ? 'rate' : 'fixed'
        const value = parseAmount(formData.get('value'))
        if (!name) return

        const nextState = deepClone(state)
        if (isEditing) {
          nextState.categories = nextState.categories.map((c) =>
            c.id === category.id ? { ...c, name, mode, value } : c,
          )
        } else {
          nextState.categories.push({ id: uid(), name, mode, value })
        }
        state = nextState
        saveState(state)
        closeModal()
        renderAll()
      },
    )
  }

  function openEmployeeModal(employee) {
    const isEditing = Boolean(employee)
    const initial = employee || { id: '', name: '', role: '', baseSalary: 0, phone: '', note: '' }

    openModal(
      isEditing ? '编辑员工档案' : '新增员工档案',
      `
        <form class="modal-form">
          <div class="form-grid">
            <label class="field">
              <span>员工姓名</span>
              <input name="name" required value="${escapeHTML(initial.name)}" placeholder="例如：张会计" />
            </label>
            <label class="field">
              <span>岗位</span>
              <input name="role" value="${escapeHTML(initial.role)}" placeholder="例如：外勤会计" />
            </label>
            <label class="field">
              <span>月基础工资</span>
              <input name="baseSalary" type="number" inputmode="decimal" value="${initial.baseSalary}" />
            </label>
            <label class="field">
              <span>联系方式</span>
              <input name="phone" value="${escapeHTML(initial.phone)}" placeholder="手机号/微信等" />
            </label>
            <label class="field span-2">
              <span>备注</span>
              <textarea name="note" rows="3" placeholder="可记录发薪备注、账号信息等">${escapeHTML(initial.note)}</textarea>
            </label>
          </div>
          <div class="divider"></div>
          <div class="toolbar" style="justify-content:flex-end">
            <button type="button" class="btn btn-ghost" data-action="close">取消</button>
            <button type="submit" class="btn btn-primary">${isEditing ? '保存' : '新增'}</button>
          </div>
        </form>
      `,
      (formData) => {
        const payload = {
          id: isEditing ? employee.id : uid(),
          name: String(formData.get('name') || '').trim(),
          role: String(formData.get('role') || '').trim(),
          baseSalary: parseAmount(formData.get('baseSalary')),
          phone: String(formData.get('phone') || '').trim(),
          note: String(formData.get('note') || '').trim(),
        }

        if (!payload.name) return

        const nextState = deepClone(state)
        if (isEditing) {
          nextState.employees = nextState.employees.map((e) => (e.id === employee.id ? payload : e))
        } else {
          nextState.employees.push(payload)
        }

        state = nextState
        saveState(state)
        closeModal()
        renderAll()
      },
    )
  }

  function openProjectModal(project) {
    if (!state.employees.length) {
      alert('请先在“基础配置”新增员工档案，再登记项目。')
      return
    }

    if (!state.categories.length) {
      alert('请先在“基础配置”新增项目分类，再登记项目。')
      return
    }

    const isEditing = Boolean(project)
    const selectedMonth = ui.month

    const baseCategory = project
      ? getCategoryById(project.categoryId) || state.categories[0]
      : state.categories[0]

    const initial = project || {
      id: '',
      month: selectedMonth,
      name: '',
      categoryId: baseCategory.id,
      amount: 0,
      startDate: '',
      endDate: '',
      hours: 0,
      status: 'in_progress',
      compliancePassed: false,
      settled: false,
      ruleMode: baseCategory.mode,
      ruleValue: baseCategory.value,
      participants: [
        { id: uid(), employeeId: state.employees[0].id, mode: 'ratio', value: 100 },
      ],
    }

    const categoryOptions = state.categories
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === initial.categoryId ? 'selected' : ''}>${c.name}</option>`,
      )
      .join('')

    const employeeOptions = state.employees
      .map((e) => `<option value="${e.id}">${e.name}</option>`)
      .join('')

    const participantRows = initial.participants
      .map((p) => renderParticipantRow(p, employeeOptions))
      .join('')

    openModal(
      isEditing ? '编辑项目' : '新增项目',
      `
        <form class="modal-form" id="project-form">
          <div class="form-grid">
            <label class="field span-2">
              <span>项目名称</span>
              <input name="name" required value="${escapeHTML(initial.name)}" placeholder="例如：A客户年度审计" />
            </label>
            <label class="field">
              <span>所属月份</span>
              <input name="month" type="month" value="${initial.month}" />
            </label>
            <label class="field">
              <span>项目类别</span>
              <select name="categoryId" id="project-category">
                ${categoryOptions}
              </select>
            </label>
            <label class="field">
              <span>项目金额</span>
              <input name="amount" type="number" inputmode="decimal" value="${initial.amount}" />
            </label>
            <label class="field">
              <span>开始时间</span>
              <input name="startDate" type="date" value="${escapeHTML(initial.startDate)}" />
            </label>
            <label class="field">
              <span>结束时间</span>
              <input name="endDate" type="date" value="${escapeHTML(initial.endDate)}" />
            </label>
            <label class="field">
              <span>项目工时</span>
              <input name="hours" type="number" inputmode="decimal" value="${initial.hours}" />
            </label>
            <label class="field">
              <span>完成状态</span>
              <select name="status">
                <option value="in_progress" ${initial.status === 'in_progress' ? 'selected' : ''}>进行中</option>
                <option value="completed" ${initial.status === 'completed' ? 'selected' : ''}>已完成</option>
              </select>
            </label>
            <label class="field">
              <span>合保校验</span>
              <select name="compliancePassed">
                <option value="false" ${!initial.compliancePassed ? 'selected' : ''}>未通过</option>
                <option value="true" ${initial.compliancePassed ? 'selected' : ''}>通过</option>
              </select>
            </label>
            <label class="field">
              <span>提成规则</span>
              <select name="ruleMode" id="project-rule-mode">
                <option value="fixed" ${initial.ruleMode === 'fixed' ? 'selected' : ''}>固定金额提成</option>
                <option value="rate" ${initial.ruleMode === 'rate' ? 'selected' : ''}>项目金额比例提成</option>
              </select>
            </label>
            <label class="field">
              <span>规则值（金额或%）</span>
              <input name="ruleValue" id="project-rule-value" type="number" inputmode="decimal" value="${initial.ruleValue}" />
            </label>
          </div>

          <div class="divider"></div>

          <div class="subpanel" style="padding:14px">
            <div class="subpanel-head">
              <div>
                <h3>员工分配（支持多人）</h3>
                <p>按比例或固定金额分配。比例建议合计 100%，系统会按你填写的比例直接拆分提成。</p>
              </div>
              <button type="button" class="btn btn-secondary" id="add-participant">新增分配</button>
            </div>
            <div class="participants" id="participants">
              ${participantRows}
            </div>
            <div id="project-calc" class="hint" style="margin-top:12px"></div>
          </div>

          <div class="divider"></div>
          <div class="toolbar" style="justify-content:flex-end">
            <button type="button" class="btn btn-ghost" data-action="close">取消</button>
            <button type="submit" class="btn btn-primary">${isEditing ? '保存项目' : '新增项目'}</button>
          </div>
        </form>
      `,
      (formData) => {
        const payload = {
          id: isEditing ? project.id : uid(),
          month: String(formData.get('month') || selectedMonth),
          name: String(formData.get('name') || '').trim(),
          categoryId: String(formData.get('categoryId') || ''),
          amount: parseAmount(formData.get('amount')),
          startDate: String(formData.get('startDate') || ''),
          endDate: String(formData.get('endDate') || ''),
          hours: parseAmount(formData.get('hours')),
          status: formData.get('status') === 'completed' ? 'completed' : 'in_progress',
          compliancePassed: formData.get('compliancePassed') === 'true',
          settled: isEditing ? Boolean(project.settled) : false,
          ruleMode: formData.get('ruleMode') === 'rate' ? 'rate' : 'fixed',
          ruleValue: parseAmount(formData.get('ruleValue')),
          participants: collectParticipants($('#participants')),
        }

        if (!payload.name) {
          alert('请填写项目名称。')
          return
        }

        if (!payload.categoryId) {
          alert('请选择项目类别。')
          return
        }

        if (!payload.participants.length) {
          alert('请至少分配一名员工。')
          return
        }

        if (payload.status !== 'completed') {
          payload.compliancePassed = false
          payload.settled = false
        }

        const nextState = deepClone(state)
        if (isEditing) {
          nextState.projects = nextState.projects.map((p) =>
            p.id === project.id ? { ...p, ...payload, updatedAt: new Date().toISOString() } : p,
          )
        } else {
          nextState.projects.push({
            ...payload,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        }

        state = normalizeState(nextState)
        saveState(state)
        closeModal()
        renderWorkbench()
      },
    )

    wireProjectModalInteractions(employeeOptions)
    updateProjectCalcPreview()
  }

  function renderParticipantRow(participant, employeeOptions) {
    return `
      <div class="participant-row" data-id="${participant.id}">
        <select data-field="employeeId">
          ${employeeOptions.replace(
            `value="${participant.employeeId}"`,
            `value="${participant.employeeId}" selected`,
          )}
        </select>
        <select data-field="mode">
          <option value="ratio" ${participant.mode !== 'fixed' ? 'selected' : ''}>按比例（%）</option>
          <option value="fixed" ${participant.mode === 'fixed' ? 'selected' : ''}>固定金额</option>
        </select>
        <input data-field="value" type="number" inputmode="decimal" value="${participant.value}" />
        <button type="button" class="btn btn-danger btn-small" data-action="remove-participant">删除</button>
      </div>
    `
  }

  function collectParticipants(container) {
    const rows = $$('.participant-row', container)
    return rows
      .map((row) => {
        const employeeId = String($('[data-field="employeeId"]', row)?.value || '')
        const mode = $('[data-field="mode"]', row)?.value === 'fixed' ? 'fixed' : 'ratio'
        const value = parseAmount($('[data-field="value"]', row)?.value)
        return { id: row.dataset.id || uid(), employeeId, mode, value }
      })
      .filter((p) => p.employeeId)
  }

  function wireProjectModalInteractions(employeeOptions) {
    const form = $('#project-form')
    if (!form) return

    const participantsEl = $('#participants')
    const addBtn = $('#add-participant')
    const calcEl = $('#project-calc')
    const categorySelect = $('#project-category')
    const ruleModeSelect = $('#project-rule-mode')
    const ruleValueInput = $('#project-rule-value')

    addBtn?.addEventListener('click', () => {
      const row = document.createElement('div')
      row.innerHTML = renderParticipantRow(
        { id: uid(), employeeId: state.employees[0]?.id || '', mode: 'ratio', value: 100 },
        employeeOptions,
      )
      participantsEl.appendChild(row.firstElementChild)
      updateProjectCalcPreview()
    })

    participantsEl?.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.dataset.action === 'remove-participant') {
        const row = target.closest('.participant-row')
        row?.remove()
        updateProjectCalcPreview()
      }
    })

    form.addEventListener('input', () => updateProjectCalcPreview())

    categorySelect?.addEventListener('change', () => {
      const category = getCategoryById(categorySelect.value)
      if (!category) return
      ruleModeSelect.value = category.mode
      ruleValueInput.value = String(category.value)
      updateProjectCalcPreview()
    })

    function updateProjectCalcPreview() {
      if (!calcEl) return

      const amount = parseAmount(form.amount.value)
      const ruleMode = form.ruleMode.value === 'rate' ? 'rate' : 'fixed'
      const ruleValue = parseAmount(form.ruleValue.value)
      const baseCommission = ruleMode === 'rate' ? amount * ruleValue * 0.01 : ruleValue
      const participants = collectParticipants(participantsEl)

      const ratioSum = participants
        .filter((p) => p.mode !== 'fixed')
        .reduce((sum, p) => sum + parseAmount(p.value), 0)

      const allocations = participants.map((p) => {
        const employee = getEmployeeById(p.employeeId)
        const employeeName = employee ? employee.name : '未知员工'
        const valueText = p.mode === 'fixed' ? `固定${formatCurrency(p.value)}` : `${p.value}%`
        const amountValue = p.mode === 'fixed' ? p.value : baseCommission * p.value * 0.01
        return `${employeeName}（${valueText}）：${formatCurrency(amountValue)}`
      })

      const warning =
        participants.some((p) => p.mode !== 'fixed') && Math.abs(ratioSum - 100) > 0.001
          ? `比例合计当前为 ${ratioSum}%，建议调整为 100%。`
          : ''

      calcEl.innerHTML = `
        <div><strong>提成计算</strong></div>
        <div style="margin-top:6px">
          项目提成基数：${
            ruleMode === 'rate'
              ? `${formatCurrency(amount)} × ${ruleValue}% = ${formatCurrency(baseCommission)}`
              : `固定 ${formatCurrency(baseCommission)}`
          }
        </div>
        <div style="margin-top:6px">分配结果：${allocations.length ? allocations.join('；') : '暂无分配'}</div>
        ${warning ? `<div style="margin-top:6px"><strong>提醒：</strong>${warning}</div>` : ''}
      `
    }
  }

  function escapeHTML(text) {
    return String(text ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  function handleProjectAction(action, projectId) {
    const project = state.projects.find((p) => p.id === projectId)
    if (!project) return

    const locked = isMonthLocked(ui.month)
    if (locked) {
      alert('当前月份已锁定，无法修改。若需调整，请先解除锁定。')
      return
    }

    if (action === 'project-edit') {
      if (project.settled) {
        alert('该项目已结算锁定，如需调整请先解除结算或解除当月锁定。')
        return
      }
      openProjectModal(project)
      return
    }

    if (action === 'project-delete') {
      if (project.settled) {
        alert('该项目已结算锁定，不能删除。')
        return
      }
      if (!window.confirm(`确认删除项目“${project.name}”吗？`)) return
      const nextState = deepClone(state)
      nextState.projects = nextState.projects.filter((p) => p.id !== project.id)
      state = normalizeState(nextState)
      saveState(state)
      renderWorkbench()
      return
    }

    if (action === 'project-toggle-status') {
      if (project.settled) return
      const nextState = deepClone(state)
      nextState.projects = nextState.projects.map((p) => {
        if (p.id !== project.id) return p
        const nextStatus = p.status === 'completed' ? 'in_progress' : 'completed'
        const nextEndDate = nextStatus === 'completed' ? p.endDate || todayISO() : ''
        return {
          ...p,
          status: nextStatus,
          endDate: nextEndDate,
          compliancePassed: nextStatus === 'completed' ? p.compliancePassed : false,
          settled: nextStatus === 'completed' ? p.settled : false,
          updatedAt: new Date().toISOString(),
        }
      })
      state = normalizeState(nextState)
      saveState(state)
      renderWorkbench()
      return
    }

    if (action === 'project-toggle-compliance') {
      if (project.settled) return
      const nextState = deepClone(state)
      nextState.projects = nextState.projects.map((p) => {
        if (p.id !== project.id) return p
        const nextCompliance = !p.compliancePassed
        return {
          ...p,
          compliancePassed: nextCompliance,
          settled: nextCompliance ? p.settled : false,
          updatedAt: new Date().toISOString(),
        }
      })
      state = normalizeState(nextState)
      saveState(state)
      renderWorkbench()
      return
    }

    if (action === 'project-settle') {
      if (project.settled) {
        alert('该项目已结算锁定。若需要调整，请先解除当月锁定并在源码中扩展“反结算”流程。')
        return
      }
      if (project.status !== 'completed') {
        alert('请先将项目标记为“已完成”。')
        return
      }
      if (!project.compliancePassed) {
        alert('合保未通过的项目禁止结算提成。')
        return
      }
      if (!window.confirm('结算后会锁定该项目的提成与分配，确认结算锁定吗？')) return
      const nextState = deepClone(state)
      nextState.projects = nextState.projects.map((p) =>
        p.id === project.id ? { ...p, settled: true, updatedAt: new Date().toISOString() } : p,
      )
      state = normalizeState(nextState)
      saveState(state)
      renderWorkbench()
      return
    }
  }

  function handleSalaryAction(action, employeeId, value) {
    if (isMonthLocked(ui.month)) {
      alert('当前月份已锁定，无法修改工资。若需调整，请先解除锁定。')
      renderSalaries(ui.month)
      return
    }

    if (action === 'salary-toggle') {
      if (ui.expandedEmployees.has(employeeId)) ui.expandedEmployees.delete(employeeId)
      else ui.expandedEmployees.add(employeeId)
      renderSalaries(ui.month)
      return
    }

    if (action === 'salary-base') {
      setMonthAdjust(employeeId, ui.month, { baseSalary: parseAmount(value) })
      return
    }

    if (action === 'salary-attendance') {
      setMonthAdjust(employeeId, ui.month, { attendance: parseAmount(value) })
      return
    }

    if (action === 'salary-social') {
      setMonthAdjust(employeeId, ui.month, { socialInsurance: parseAmount(value) })
      return
    }
  }

  function exportCSV() {
    const month = ui.month
    const rows = getFilteredProjects(month)
    const headers = [
      '项目名称',
      '项目类别',
      '项目金额',
      '负责员工',
      '开始时间',
      '结束时间',
      '项目工时',
      '完成状态',
      '结算状态',
      '合保校验',
      '提成金额',
    ]

    const lines = [headers.map(escapeCSV).join(',')]

    rows.forEach((project) => {
      const category = getCategoryById(project.categoryId)
      const categoryName = category ? category.name : '未分类'
      const { allocations, total } = getProjectCommissionAllocations(project)

      const employeeText = allocations
        .map((item) => {
          const p = item.participant
          const desc = p.mode === 'fixed' ? `固定${formatCurrency(p.value)}` : `${p.value}%`
          return `${item.employeeName}(${desc}=${formatCurrency(item.amount)})`
        })
        .join('; ')

      const commission = isProjectEligibleForPayroll(project) ? total : 0

      const data = [
        project.name,
        categoryName,
        project.amount,
        employeeText,
        project.startDate,
        project.endDate,
        project.hours,
        project.status === 'completed' ? '已完成' : '进行中',
        project.settled ? '已结算' : '未结算',
        project.compliancePassed ? '通过' : '未通过',
        commission,
      ]

      lines.push(data.map(escapeCSV).join(','))
    })

    const bom = '\ufeff'
    downloadText(`项目台账_${month}.csv`, bom + lines.join('\n'), 'text/csv;charset=utf-8')
  }

  function exportBackup() {
    const backup = {
      exportedAt: new Date().toISOString(),
      app: 'acct-payroll-spa',
      version: APP_VERSION,
      data: state,
    }
    downloadText(
      `工资与提成_全量备份_${ui.month}.json`,
      JSON.stringify(backup, null, 2),
      'application/json;charset=utf-8',
    )
  }

  function importBackup(file) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''))
        const payload = parsed?.data ?? parsed
        state = normalizeState(payload)
        saveState(state)
        ui.expandedEmployees.clear()
        ui.selectedEmployees.clear()
        alert('导入成功，已恢复数据。')
        renderAll()
      } catch (error) {
        console.error(error)
        alert('导入失败：备份文件格式不正确。')
      }
    }
    reader.readAsText(file)
  }

  function clearAllData() {
    if (!window.confirm('确认清空全部数据吗？此操作不可恢复，建议先导出备份。')) return
    localStorage.removeItem(STORAGE_KEY)
    state = defaultData()
    ui.expandedEmployees.clear()
    ui.selectedEmployees.clear()
    renderAll()
  }

  function renderWorkbench() {
    const month = ui.month
    els.monthInput.value = month
    renderSummary(month)
    renderEmployeeFilterOptions()
    renderProjects(month)
    renderSalaries(month)
  }

  function renderSettings() {
    renderCategories()
    renderEmployees()
  }

  function renderAll() {
    renderWorkbench()
    renderSettings()
  }

  function bindEvents() {
    els.navButtons.forEach((btn) => {
      btn.addEventListener('click', () => setRoute(btn.dataset.route))
    })

    els.monthInput.addEventListener('change', (event) => {
      ui.month = event.target.value || currentMonth()
      ui.expandedEmployees.clear()
      renderWorkbench()
    })

    els.lockToggle.addEventListener('click', () => {
      const locked = isMonthLocked(ui.month)
      if (!locked) {
        if (!window.confirm('锁定后本月项目与工资将不可编辑。确认锁定吗？')) return
      }
      setMonthLocked(ui.month, !locked)
    })

    els.exportBackup.addEventListener('click', exportBackup)
    els.importBackup.addEventListener('change', (event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) importBackup(file)
    })

    els.addProject.addEventListener('click', () => openProjectModal(null))
    els.exportCSV.addEventListener('click', exportCSV)

    els.filterEmployee.addEventListener('change', (event) => {
      ui.projectFilterEmployee = event.target.value
      renderProjects(ui.month)
    })

    els.filterStatus.addEventListener('change', (event) => {
      ui.projectFilterStatus = event.target.value
      renderProjects(ui.month)
    })

    els.filterKeyword.addEventListener('input', (event) => {
      ui.projectFilterKeyword = event.target.value
      renderProjects(ui.month)
    })

    els.projectBody.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const action = target.dataset.action
      const id = target.dataset.id
      if (!action || !id) return
      handleProjectAction(action, id)
    })

    els.salaryBody.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const action = target.dataset.action
      const id = target.dataset.id
      if (action === 'salary-toggle' && id) {
        handleSalaryAction(action, id)
      }
    })

    els.salaryBody.addEventListener('change', (event) => {
      const target = event.target
      if (!(target instanceof HTMLInputElement)) return
      const action = target.dataset.action
      const id = target.dataset.id
      if (!action || !id) return
      handleSalaryAction(action, id, target.value)
    })

    els.addCategory.addEventListener('click', () => openCategoryModal(null))
    els.addEmployee.addEventListener('click', () => openEmployeeModal(null))
    els.batchDeleteEmployees?.addEventListener('click', () => {
      deleteEmployees([...ui.selectedEmployees])
    })
    els.employeeSelectAll?.addEventListener('change', (event) => {
      if (event.target.checked) {
        ui.selectedEmployees = new Set(state.employees.map((employee) => employee.id))
      } else {
        ui.selectedEmployees.clear()
      }
      renderEmployees()
    })

    els.categoryBody.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const action = target.dataset.action
      const id = target.dataset.id
      if (!action || !id) return

      const category = state.categories.find((c) => c.id === id)
      if (!category) return

      if (action === 'category-edit') {
        openCategoryModal(category)
        return
      }

      if (action === 'category-delete') {
        const used = state.projects.some((p) => p.categoryId === id)
        if (used) {
          alert('该分类已被项目使用，建议先把相关项目改为其他分类后再删除。')
          return
        }
        if (!window.confirm(`确认删除分类“${category.name}”吗？`)) return
        const nextState = deepClone(state)
        nextState.categories = nextState.categories.filter((c) => c.id !== id)
        state = normalizeState(nextState)
        saveState(state)
        renderAll()
      }
    })

    els.employeeBody.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const action = target.dataset.action
      const id = target.dataset.id
      if (!action || !id) return

      const employee = state.employees.find((e) => e.id === id)
      if (!employee) return

      if (action === 'employee-edit') {
        openEmployeeModal(employee)
        return
      }

      if (action === 'employee-delete') {
        deleteEmployees([id])
      }
    })

    els.employeeBody.addEventListener('change', (event) => {
      const target = event.target
      if (!(target instanceof HTMLInputElement)) return
      const action = target.dataset.action
      const id = target.dataset.id
      if (action !== 'employee-select' || !id) return

      if (target.checked) ui.selectedEmployees.add(id)
      else ui.selectedEmployees.delete(id)

      renderEmployees()
    })

    els.clearData.addEventListener('click', clearAllData)

    els.modalRoot.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const action = target.dataset.action
      if (action === 'close') {
        closeModal()
      }
    })

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !els.modalRoot.hidden) closeModal()
    })
  }

  // small helper: allow CSS muted line inside table
  const style = document.createElement('style')
  style.textContent = `.muted{color:var(--muted);font-size:12px;margin-top:4px}`
  document.head.appendChild(style)

  bindEvents()
  renderAll()
})()
