-- survey.lua: turns the `survey` metadata (from surveys/<year>.yml, merged in by index.qmd's `metadata-files`)
-- into the form's HTML, in place of the empty `#survey` div in index.qmd. The form works without this
-- page's script only as far as reading it; `assets/survey.js` validates and sends it.

local stringify = pandoc.utils.stringify

local function esc(s)
  return (tostring(s):gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;'):gsub('"', '&quot;'))
end

local function str(v)
  if v == nil then return nil end
  if type(v) == 'boolean' then return tostring(v) end
  return stringify(v)
end

local function truthy(v)
  return v == true or str(v) == 'true'
end

-- An option is a string, or a map with a label, an optional detail line, and an optional exclusive flag.
local function option(o)
  if type(o) == 'table' and o.label ~= nil then
    return str(o.label), o.detail and str(o.detail) or nil, truthy(o.exclusive)
  end
  return str(o), nil, false
end

local function choice(q, kind, label, detail, exclusive, n)
  local id = q.id .. '-' .. n
  local small = detail and ('<small>' .. esc(detail) .. '</small>') or ''
  local ex = exclusive and ' data-exclusive' or ''
  return string.format(
    '<label class="opt" for="%s"><input type="%s" name="%s" id="%s" value="%s"%s><span>%s%s</span></label>',
    id, kind, q.id, id, esc(label), ex, esc(label), small)
end

local function choices(q, kind)
  local out, n = {}, 0
  local function add(list)
    for _, o in ipairs(list) do
      n = n + 1
      local label, detail, exclusive = option(o)
      table.insert(out, choice(q, kind, label, detail, exclusive, n))
    end
  end
  if q.groups then
    for _, g in ipairs(q.groups) do
      table.insert(out, '<div class="opt-group"><div class="group-label">' .. esc(str(g.label)) .. '</div>')
      add(g.options)
      table.insert(out, '</div>')
    end
  else
    add(q.options or {})
  end
  if q.other then
    local id = q.id .. '-other'
    table.insert(out, string.format(
      '<div class="opt opt-other"><input type="%s" name="%s" id="%s" value="Other" aria-label="Other"><input type="text" class="other-text" id="%s-text" name="%s_other" placeholder="Other" maxlength="200" aria-label="Other, please describe"></div>',
      kind, q.id, id, id, q.id))
  end
  local cls = truthy(q.columns) and 'opts cols' or 'opts'
  return '<div class="' .. cls .. '">' .. table.concat(out) .. '</div>'
end

local function control(q)
  local t = q.type
  if t == 'radio' or t == 'checkbox' then return choices(q, t) end
  local ph = q.placeholder and (' placeholder="' .. esc(str(q.placeholder)) .. '"') or ''
  local lab = ' aria-labelledby="' .. q.id .. '-label"'
  if t == 'select' then
    local out = { '<select id="' .. q.id .. '" name="' .. q.id .. '"' .. lab .. '><option value="">Choose one</option>' }
    for _, o in ipairs(q.options or {}) do
      local label = option(o)
      table.insert(out, '<option>' .. esc(label) .. '</option>')
    end
    table.insert(out, '</select>')
    return table.concat(out)
  elseif t == 'textarea' then
    return '<textarea id="' .. q.id .. '" name="' .. q.id .. '" maxlength="2000"' .. ph .. lab .. '></textarea>'
  elseif t == 'email' then
    return '<input type="email" id="' .. q.id .. '" name="' .. q.id .. '" autocomplete="email" maxlength="200"' .. ph .. lab .. '>'
  else
    return '<input type="text" id="' .. q.id .. '" name="' .. q.id .. '" maxlength="200"' .. ph .. lab .. '>'
  end
end

-- One question's block: its label and hint, its control, and a slot for the validation message.
local function block(q, number)
  local attrs = string.format(' data-q="%s" data-type="%s"', q.id, q.type)
  if truthy(q.required) then attrs = attrs .. ' data-required="true"' end
  if q.max then attrs = attrs .. ' data-max="' .. esc(str(q.max)) .. '"' end
  local num = number and ('<span class="num">' .. number .. '</span>') or ''
  local req = truthy(q.required) and '<span class="req" title="Required">Required</span>' or ''
  local cls = number and 'q' or 'q part'
  local head = string.format('<div class="%s" id="%s-label">%s<span class="q-text">%s</span>%s</div>',
    cls, q.id, num, esc(str(q.label)), req)
  local hint = q.hint and ('<div class="hint">' .. esc(str(q.hint)) .. '</div>') or ''
  local count = q.max and ('<div class="counter" aria-live="polite"></div>') or ''
  return '<div class="question"' .. attrs .. '>' .. head .. hint .. control(q) .. count ..
    '<div class="error" role="alert"></div></div>'
end

local function form(s)
  local out = {}
  local number, open = 0, false
  for _, q in ipairs(s.questions) do
    q.id = str(q.id)
    q.type = str(q.type)
    if not truthy(q.part) then
      if open then table.insert(out, '</fieldset>') end
      number = number + 1
      table.insert(out, '<fieldset>')
      open = true
      table.insert(out, block(q, number))
    else
      table.insert(out, block(q, nil))
    end
  end
  if open then table.insert(out, '</fieldset>') end
  local head = string.format(
    '<p class="lede">%s</p><p class="survey-meta">%s</p>', esc(str(s.intro)), esc(str(s.meta)))
  -- The honeypot: off screen and out of the tab order, so only a bot fills it in; the receiver discards those.
  local hp = '<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>'
  local actions = '<div class="actions"><button type="submit" class="dss-btn">Submit</button><span class="status" role="status"></span></div>'
  local thanks = '<div id="survey-thanks" class="thanks" hidden tabindex="-1"><h2>Thank you</h2><p>' .. esc(str(s.thanks)) .. '</p></div>'
  return head .. string.format('<form id="survey-form" data-survey="%s" data-endpoint="%s" novalidate>',
      esc(str(s.id)), esc(str(s.endpoint))) ..
    table.concat(out) .. hp .. actions .. '</form>' .. thanks
end

function Pandoc(doc)
  local s = doc.meta.survey
  if not s then return doc end
  local html = pandoc.RawBlock('html', form(s))
  doc.blocks = doc.blocks:walk({
    Div = function(d)
      if d.identifier == 'survey' then return html end
    end
  })
  return doc
end
