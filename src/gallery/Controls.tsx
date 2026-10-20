import {
  Button as AriaButton,
  Checkbox,
  FieldError,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Radio,
  RadioGroup,
  SearchField,
  Select,
  SelectValue,
  Slider,
  SliderFill,
  SliderOutput,
  SliderThumb,
  SliderTrack,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  TextArea,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "react-aria-components";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Square,
} from "lucide-react";
import { Button, IconButton } from "../components/Button";
import { Section, Specimen } from "../components/Section";
import { Handle, Kbd, Status, Tag, type SessionStatus } from "../components/Status";

const backends = [
  { id: "claude", name: "Claude Code · claude-agent-acp" },
  { id: "codex", name: "Codex · codex-acp" },
  { id: "gemini", name: "Gemini · command manifest" },
  { id: "opencode", name: "OpenCode · ACP" },
];

const statuses: SessionStatus[] = [
  "starting",
  "idle",
  "busy",
  "waiting_permission",
  "failed",
  "closed",
];

export function Controls() {
  return (
    <>
      <Section
        id="buttons"
        index="05"
        title="Buttons"
        description="Buttons are console keys: square, one pixel, uppercase mono. The primary action is the only cyan fill in reach. Destructive actions read red before they are pressed, and confirm in red only at the last step."
      >
        <Specimen label="Variants" note="One primary per view. Ghost for toolbar chrome.">
          <div className="row row--wide">
            <Button variant="primary">
              <Plus className="btn__icon icon" />
              Spawn session
            </Button>
            <Button>
              <Send className="btn__icon icon" />
              Send prompt
            </Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">
              <Square className="btn__icon icon" />
              Close session
            </Button>
            <Button isDisabled>Disabled</Button>
          </div>
        </Specimen>

        <Specimen label="Sizes" note="Small for table rows and inspectors; large for the one action that matters.">
          <div className="row row--wide" style={{ alignItems: "center" }}>
            <Button size="sm">Small</Button>
            <Button>Medium</Button>
            <Button size="lg">Large</Button>
            <span className="caption">26 / 30 / 36 px</span>
          </div>
        </Specimen>

        <Specimen label="Icon buttons and groups" note="Icons are 14px, square caps, 1.5px stroke.">
          <div className="row row--wide">
            <IconButton aria-label="Play session">
              <Play className="btn__icon icon" />
            </IconButton>
            <IconButton aria-label="Pause session">
              <Pause className="btn__icon icon" />
            </IconButton>
            <IconButton aria-label="Stop session">
              <Square className="btn__icon icon" />
            </IconButton>
            <IconButton aria-label="More actions">
              <MoreHorizontal className="btn__icon icon" />
            </IconButton>
            <span style={{ width: 12 }} />
            <div className="btn-group">
              <Button size="sm">Allow once</Button>
              <Button size="sm">Always</Button>
              <Button size="sm" variant="danger">
                Deny
              </Button>
            </div>
          </div>
        </Specimen>

        <Specimen label="With keyboard hints" note="The shortcut sits inside the action, not in a help page.">
          <div className="row row--wide">
            <Button variant="primary">
              <Plus className="btn__icon icon" />
              New session
              <Kbd>⌘N</Kbd>
            </Button>
            <Button>
              Send prompt
              <Kbd>↵</Kbd>
            </Button>
            <Button variant="ghost">
              Command palette
              <Kbd>⌘K</Kbd>
            </Button>
          </div>
        </Specimen>
      </Section>

      <Section
        id="fields"
        index="06"
        title="Fields"
        description="Inputs are raised one step, bordered once, and focused with the accent. Labels are short mono caps; hints explain consequences; errors say what is wrong and what to do."
      >
        <div className="grid-2">
          <TextField className="field" defaultValue="docs-audit">
            <Label className="field__label">
              Session name <span className="field__req">*</span>
            </Label>
            <div className="field__control">
              <Input className="field__input" />
            </div>
            <Text slot="description" className="field__hint">
              Lowercase, hyphenated. The six-character handle is generated at spawn.
            </Text>
          </TextField>

          <SearchField className="field">
            <Label className="field__label">
              Search fleet <Kbd>⌘K</Kbd>
            </Label>
            <div className="field__search">
              <Search className="field__search-icon icon" />
              <Input className="field__input" placeholder="name, handle, backend…" />
            </div>
            <span className="field__hint">Searches the live table, not the transcript.</span>
          </SearchField>

          <Select className="field" defaultSelectedKey="claude">
            <Label className="field__label">Backend</Label>
            <AriaButton className="select__trigger">
              <SelectValue className="select__value" />
              <ChevronDown className="select__chevron icon" />
            </AriaButton>
            <Popover className="select__popover">
              <ListBox className="select__list">
                {backends.map((backend) => (
                  <ListBoxItem
                    key={backend.id}
                    id={backend.id}
                    textValue={backend.name}
                    className="select__option"
                  >
                    {backend.name}
                    <Check className="select__option-check icon" />
                  </ListBoxItem>
                ))}
              </ListBox>
            </Popover>
            <Text slot="description" className="field__hint">
              The adapter is a data manifest: command, arguments, environment.
            </Text>
          </Select>

          <TextField className="field" defaultValue="D:\dev\hlao">
            <Label className="field__label">Working directory</Label>
            <div className="field__control">
              <Input className="field__input" />
            </div>
            <Text slot="description" className="field__hint">
              Announced to the leaf at birth. The dashboard never reads it.
            </Text>
          </TextField>
        </div>

        <Specimen label="States" note="Focus is forced in the first field so the specimen is legible.">
          <div className="grid-3">
            <TextField className="field field--focus" defaultValue="4f2a9c">
              <Label className="field__label">Focused</Label>
              <div className="field__control">
                <Input className="field__input" />
              </div>
              <span className="field__hint">1px accent border. No glow.</span>
            </TextField>

            <TextField className="field" defaultValue="not/a/path" isInvalid>
              <Label className="field__label">Invalid</Label>
              <div className="field__control">
                <Input className="field__input" />
              </div>
              <FieldError className="field__error">
                <CircleAlert className="field__error-icon icon" />
                Directory does not exist.
              </FieldError>
            </TextField>

            <TextField className="field" defaultValue="acp_9f2c41" isDisabled>
              <Label className="field__label">Disabled</Label>
              <div className="field__control">
                <Input className="field__input" />
              </div>
              <span className="field__hint">Agent session id: diagnostics only.</span>
            </TextField>
          </div>
        </Specimen>

        <Specimen label="Prompt composer" note="The composer is a field, not a chat bubble.">
          <TextField
            className="field"
            defaultValue="Run the auth tests and report the first failure. Do not change retry semantics until you have shown me the race."
          >
            <Label className="field__label">Prompt</Label>
            <div className="field__control">
              <TextArea className="field__textarea" />
            </div>
            <div className="row row--between">
              <span className="field__hint">Queued after the current turn. One turn at a time.</span>
              <Button size="sm" variant="primary">
                <Send className="btn__icon icon" />
                Queue prompt
              </Button>
            </div>
          </TextField>
        </Specimen>
      </Section>

      <Section
        id="selection"
        index="07"
        title="Selection"
        description="Selection marks are square; state is a fill, not a checkmark-only gesture. Radio cards are used when the choice needs a sentence of consequence. A switch is immediate; a checkbox is part of a form."
      >
        <div className="grid-2">
          <div className="stack">
            <span className="label-1">Checkbox</span>
            <Checkbox className="check" defaultSelected>
              <span className="check__box">
                <Check className="check__icon icon" />
              </span>
              <span>Include closed sessions</span>
            </Checkbox>
            <Checkbox className="check" defaultSelected>
              <span className="check__box">
                <Check className="check__icon icon" />
              </span>
              <span>Show provider-native state</span>
            </Checkbox>
            <Checkbox className="check">
              <span className="check__box">
                <Check className="check__icon icon" />
              </span>
              <span>Auto-scroll transcript</span>
            </Checkbox>
            <Checkbox className="check" isDisabled defaultSelected>
              <span className="check__box">
                <Check className="check__icon icon" />
              </span>
              <span>Read-only (wire 2.4 supervisor)</span>
            </Checkbox>
          </div>

          <div className="stack">
            <span className="label-1">Switch</span>
            <Switch className="switch" defaultSelected>
              <span className="switch__track">
                <span className="switch__thumb" />
              </span>
              <span>Follow live output</span>
            </Switch>
            <Switch className="switch">
              <span className="switch__track">
                <span className="switch__thumb" />
              </span>
              <span>Desktop notifications</span>
            </Switch>
            <span className="field__hint">
              A switch takes effect immediately. A checkbox is collected and submitted.
            </span>
          </div>
        </div>

        <Specimen label="Radio cards" note="The selected card gets a cyan rule and a wash; the choice is readable without reading the dot.">
          <RadioGroup className="radio-group" defaultValue="ask">
            <Label className="radio-group__label">Permission policy</Label>
            <Radio value="ask" className="radio-card">
              <span className="radio-card__box">
                <span className="radio-card__dot" />
              </span>
              <span className="radio-card__text">
                <span className="radio-card__title">Ask</span>
                <span className="radio-card__desc">
                  Park the turn on a permission request until an operator answers.
                </span>
              </span>
            </Radio>
            <Radio value="allow" className="radio-card">
              <span className="radio-card__box">
                <span className="radio-card__dot" />
              </span>
              <span className="radio-card__text">
                <span className="radio-card__title">Allow</span>
                <span className="radio-card__desc">
                  Answer every request with its first allow option. Fast, and less visible.
                </span>
              </span>
            </Radio>
            <Radio value="deny" className="radio-card">
              <span className="radio-card__box">
                <span className="radio-card__dot" />
              </span>
              <span className="radio-card__text">
                <span className="radio-card__title">Deny</span>
                <span className="radio-card__desc">
                  Refuse every request. The session stays alive but cannot act.
                </span>
              </span>
            </Radio>
          </RadioGroup>
        </Specimen>

        <Specimen label="Slider" note="Track 2px, thumb 10px square, fill in the accent.">
          <Slider className="slider" defaultValue={75} minValue={0} maxValue={100} step={1}>
            <div className="slider__head">
              <Label className="slider__label">Context warning threshold</Label>
              <SliderOutput className="slider__output" />
            </div>
            <SliderTrack className="slider__track">
              <SliderFill className="slider__fill" />
              <SliderThumb className="slider__thumb" />
            </SliderTrack>
          </Slider>
        </Specimen>
      </Section>

      <Section
        id="navigation"
        index="08"
        title="Navigation"
        description="Tabs are a two-pixel underline. Segments invert the selected item. Breadcrumbs are a path, not a hierarchy of pills. Nothing floats; the active state is always an edge."
      >
        <Specimen label="Tabs" note="The active tab owns a 2px accent rule on the shared hairline.">
          <Tabs className="tabs" defaultSelectedKey="overview">
            <TabList className="tabs__list" aria-label="Session views">
              <Tab id="overview" className="tabs__tab">
                Overview
              </Tab>
              <Tab id="transcript" className="tabs__tab">
                Transcript
              </Tab>
              <Tab id="plan" className="tabs__tab">
                Plan
              </Tab>
            </TabList>
            <TabPanel id="overview" className="tabs__panel">
              <p className="note">
                Turn 07 · 2 prompts queued · context 62% · the last event is a Bash call.
              </p>
            </TabPanel>
            <TabPanel id="transcript" className="tabs__panel">
              <p className="note">The transcript is the selected session&apos;s event log, not the fleet&apos;s.</p>
            </TabPanel>
            <TabPanel id="plan" className="tabs__panel">
              <p className="note">Plan entries are provider-native state, gated on the 2.5 capability.</p>
            </TabPanel>
          </Tabs>
        </Specimen>

        <Specimen label="Segments" note="A hard inversion, not a pill. Adjacent borders collapse.">
          <ToggleButtonGroup
            className="segmented"
            selectionMode="single"
            defaultSelectedKeys={["all"]}
          >
            <ToggleButton id="all" className="segmented__item">
              All
            </ToggleButton>
            <ToggleButton id="busy" className="segmented__item">
              Busy
            </ToggleButton>
            <ToggleButton id="waiting" className="segmented__item">
              Waiting
            </ToggleButton>
            <ToggleButton id="idle" className="segmented__item">
              Idle
            </ToggleButton>
          </ToggleButtonGroup>
        </Specimen>

        <Specimen label="Breadcrumbs and pagination" note="Mono path; square page cells.">
          <div className="stack">
            <nav aria-label="Breadcrumb" className="breadcrumbs">
              <a href="#table" className="breadcrumbs__link">
                Fleet
              </a>
              <ChevronRight className="breadcrumbs__sep icon" />
              <a href="#table" className="breadcrumbs__link">
                4f2a9c
              </a>
              <ChevronRight className="breadcrumbs__sep icon" />
              <span className="breadcrumbs__current">Transcript</span>
            </nav>
            <div className="pagination" aria-label="Fleet pages">
              <button type="button" className="pagination__item" aria-label="Previous page">
                <ChevronLeft className="icon" />
              </button>
              <button type="button" className="pagination__item" aria-current="page">
                1
              </button>
              <button type="button" className="pagination__item">
                2
              </button>
              <button type="button" className="pagination__item">
                3
              </button>
              <button type="button" className="pagination__item" aria-label="Next page">
                <ChevronRight className="icon" />
              </button>
            </div>
          </div>
        </Specimen>
      </Section>

      <Section
        id="status"
        index="09"
        title="Status, tags, and keys"
        description="A six-pixel lamp is the fastest read in the interface; the mono label is the precise one. Status colors never travel alone, cyan is never used for a state that is not live or selected, and idle or settled is quiet — never done."
      >
        <Specimen label="Session states" note="The lamp shape also differs: starting is hollow, the rest are solid.">
          <div className="grid-3">
            {statuses.map((status) => (
              <div
                key={status}
                className="panel"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
              >
                <Status status={status} />
                <span className="caption">status.{status}</span>
              </div>
            ))}
          </div>
        </Specimen>

        <Specimen
          label="Tags, handles, and keycaps"
          note="All square, all mono. Settled means no active turn and an empty queue — never done."
        >
          <div className="grid-2">
            <div className="stack">
              <span className="label-1">Tags</span>
              <div className="row">
                <Tag>claude</Tag>
                <Tag>codex</Tag>
                <Tag>gemini</Tag>
                <Tag tone="accent">wire 2.5</Tag>
                <Tag tone="warn">manual</Tag>
                <Tag tone="danger">failed</Tag>
                <Tag tone="ok">settled</Tag>
              </div>
            </div>
            <div className="stack">
              <span className="label-1">Handles</span>
              <div className="row row--wide">
                <Handle id="4f2a9c" />
                <Handle id="9c1e07" />
                <Handle id="b73d11" />
                <span className="caption">six characters, no ambiguity</span>
              </div>
            </div>
            <div className="stack">
              <span className="label-1">Keycaps</span>
              <div className="row">
                <Kbd>⌘K</Kbd>
                <Kbd>⇧↵</Kbd>
                <Kbd>ESC</Kbd>
                <Kbd>⌘.</Kbd>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
              </div>
            </div>
            <div className="stack">
              <span className="label-1">Status in context</span>
              <div className="row row--wide">
                <Status status="busy" />
                <Handle id="4f2a9c" />
                <span className="caption">refactor-auth</span>
              </div>
            </div>
          </div>
        </Specimen>
      </Section>
    </>
  );
}
