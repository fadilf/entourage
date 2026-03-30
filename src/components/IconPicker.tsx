"use client";

import Image from "next/image";
import { useState } from "react";
import {
  // Tech & Dev
  Rocket, Brain, Lightning, Code, Terminal, Database, Robot, Cpu, Bug,
  GitBranch, Plug, Lightbulb, MagicWand, Sparkle, ShootingStar,
  // Science
  Atom, Flask, Microscope, Binoculars, Dna,
  // Characters & Faces
  Alien, Ghost, Skull, Detective, Smiley, SmileyWink, SmileyMelting,
  SmileyXEyes, HandWaving, ThumbsUp, HandPeace, MaskHappy, MaskSad,
  // Animals
  Cat, Dog, Fish, Bird, Butterfly, Horse, PawPrint, Cow, Rabbit,
  Shrimp, BugBeetle,
  // Nature & Weather
  Eye, Fire, Sun, Moon, Cloud, Snowflake, Drop, Wind, TreeEvergreen,
  TreePalm, Flower, FlowerLotus, FlowerTulip, Leaf, Cactus, Acorn,
  Mountains, Planet, Meteor, Rainbow, Tornado, Waves, Campfire, Island,
  // Food & Drink
  Coffee, Wine, CookingPot, Cookie, IceCream, Pepper, Pizza, Hamburger,
  Cake, Popcorn, BeerStein, Champagne, Martini, ForkKnife, ChefHat,
  Avocado, OrangeSlice, Carrot,
  // Arts & Media
  Camera, FilmSlate, Headphones, MusicNotes, Guitar, PaintBrush,
  Palette, PencilSimple, BookOpen, Megaphone, Metronome,
  // Games & Fun
  GameController, PuzzlePiece, Trophy, Medal, Crown, Confetti, Balloon,
  DiceSix, PokerChip, Pinwheel, RocketLaunch,
  // Sports
  SoccerBall, TennisBall, Football, BoxingGlove, SwimmingPool,
  // Combat & Defense
  Sword, Shield, Target, Crosshair,
  // Transport
  Airplane, Car, Sailboat, Bicycle, Train, Motorcycle, Scooter, Jeep,
  Parachute,
  // Places & Structures
  House, Lighthouse, CastleTurret, Bridge, Barn, Factory,
  // People & Social
  Users, UserCircle, CowboyHat, Sunglasses,
  // Objects
  Heart, Star, Diamond, Gift, Bell, Flag, Key, Lock, Compass, Globe,
  MapPin, Anchor, Briefcase, Scroll, Magnet, Lamp, Broom,
  // Health & Body
  Tooth, Heartbeat, Fingerprint,
  // Time & Tools
  Hourglass, Clock, Calendar, Umbrella, Scissors, Wrench, Hammer,
  // Shapes
  Hexagon, Octagon,
  // Upload (used in upload UI)
  Upload,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { Icon } from "@/lib/types";

// Phosphor icon entries: [key, component, label]
const PHOSPHOR_ICONS: [string, PhosphorIcon, string][] = [
  // Tech & Dev
  ["Robot", Robot, "Robot"],
  ["Code", Code, "Code"],
  ["Terminal", Terminal, "Terminal"],
  ["Database", Database, "Database"],
  ["Cpu", Cpu, "CPU"],
  ["Bug", Bug, "Bug"],
  ["GitBranch", GitBranch, "Git Branch"],
  ["Plug", Plug, "Plug"],
  // Science
  ["Brain", Brain, "Brain"],
  ["Atom", Atom, "Atom"],
  ["Flask", Flask, "Flask"],
  ["Microscope", Microscope, "Microscope"],
  ["Binoculars", Binoculars, "Binoculars"],
  ["Dna", Dna, "DNA"],
  ["Lightbulb", Lightbulb, "Lightbulb"],
  // Magic & Cosmic
  ["MagicWand", MagicWand, "Magic Wand"],
  ["Sparkle", Sparkle, "Sparkle"],
  ["ShootingStar", ShootingStar, "Shooting Star"],
  ["Lightning", Lightning, "Lightning"],
  ["Fire", Fire, "Fire"],
  ["Planet", Planet, "Planet"],
  ["Meteor", Meteor, "Meteor"],
  ["Rainbow", Rainbow, "Rainbow"],
  // Characters & Faces
  ["Alien", Alien, "Alien"],
  ["Ghost", Ghost, "Ghost"],
  ["Skull", Skull, "Skull"],
  ["Detective", Detective, "Detective"],
  ["Smiley", Smiley, "Smiley"],
  ["SmileyWink", SmileyWink, "Wink"],
  ["SmileyMelting", SmileyMelting, "Melting"],
  ["SmileyXEyes", SmileyXEyes, "Dizzy"],
  ["MaskHappy", MaskHappy, "Happy Mask"],
  ["MaskSad", MaskSad, "Sad Mask"],
  ["HandWaving", HandWaving, "Wave"],
  ["ThumbsUp", ThumbsUp, "Thumbs Up"],
  ["HandPeace", HandPeace, "Peace"],
  // Animals
  ["Cat", Cat, "Cat"],
  ["Dog", Dog, "Dog"],
  ["Fish", Fish, "Fish"],
  ["Bird", Bird, "Bird"],
  ["Butterfly", Butterfly, "Butterfly"],
  ["Horse", Horse, "Horse"],
  ["Cow", Cow, "Cow"],
  ["Rabbit", Rabbit, "Rabbit"],
  ["Shrimp", Shrimp, "Shrimp"],
  ["BugBeetle", BugBeetle, "Beetle"],
  ["PawPrint", PawPrint, "Paw Print"],
  // Nature & Weather
  ["Sun", Sun, "Sun"],
  ["Moon", Moon, "Moon"],
  ["Cloud", Cloud, "Cloud"],
  ["Snowflake", Snowflake, "Snowflake"],
  ["Drop", Drop, "Drop"],
  ["Wind", Wind, "Wind"],
  ["Tornado", Tornado, "Tornado"],
  ["Waves", Waves, "Waves"],
  ["TreeEvergreen", TreeEvergreen, "Pine Tree"],
  ["TreePalm", TreePalm, "Palm Tree"],
  ["Flower", Flower, "Flower"],
  ["FlowerLotus", FlowerLotus, "Lotus"],
  ["FlowerTulip", FlowerTulip, "Tulip"],
  ["Leaf", Leaf, "Leaf"],
  ["Cactus", Cactus, "Cactus"],
  ["Acorn", Acorn, "Acorn"],
  ["Mountains", Mountains, "Mountains"],
  ["Island", Island, "Island"],
  ["Campfire", Campfire, "Campfire"],
  // Food & Drink
  ["Coffee", Coffee, "Coffee"],
  ["Wine", Wine, "Wine"],
  ["BeerStein", BeerStein, "Beer"],
  ["Champagne", Champagne, "Champagne"],
  ["Martini", Martini, "Martini"],
  ["CookingPot", CookingPot, "Cooking Pot"],
  ["ForkKnife", ForkKnife, "Fork & Knife"],
  ["ChefHat", ChefHat, "Chef Hat"],
  ["Pizza", Pizza, "Pizza"],
  ["Hamburger", Hamburger, "Hamburger"],
  ["Cake", Cake, "Cake"],
  ["Cookie", Cookie, "Cookie"],
  ["IceCream", IceCream, "Ice Cream"],
  ["Popcorn", Popcorn, "Popcorn"],
  ["Avocado", Avocado, "Avocado"],
  ["OrangeSlice", OrangeSlice, "Orange"],
  ["Carrot", Carrot, "Carrot"],
  ["Pepper", Pepper, "Pepper"],
  // Arts & Media
  ["Camera", Camera, "Camera"],
  ["FilmSlate", FilmSlate, "Film"],
  ["Headphones", Headphones, "Headphones"],
  ["MusicNotes", MusicNotes, "Music"],
  ["Guitar", Guitar, "Guitar"],
  ["Metronome", Metronome, "Metronome"],
  ["Megaphone", Megaphone, "Megaphone"],
  ["PaintBrush", PaintBrush, "Paint Brush"],
  ["Palette", Palette, "Palette"],
  ["Pencil", PencilSimple, "Pencil"],
  ["BookOpen", BookOpen, "Book"],
  ["Scroll", Scroll, "Scroll"],
  // Games & Fun
  ["GameController", GameController, "Game Controller"],
  ["PuzzlePiece", PuzzlePiece, "Puzzle"],
  ["Trophy", Trophy, "Trophy"],
  ["Medal", Medal, "Medal"],
  ["Crown", Crown, "Crown"],
  ["Confetti", Confetti, "Confetti"],
  ["Balloon", Balloon, "Balloon"],
  ["Pinwheel", Pinwheel, "Pinwheel"],
  ["DiceSix", DiceSix, "Dice"],
  ["PokerChip", PokerChip, "Poker Chip"],
  // Sports
  ["SoccerBall", SoccerBall, "Soccer"],
  ["TennisBall", TennisBall, "Tennis"],
  ["Football", Football, "Football"],
  ["BoxingGlove", BoxingGlove, "Boxing"],
  ["SwimmingPool", SwimmingPool, "Swimming"],
  // Combat & Defense
  ["Sword", Sword, "Sword"],
  ["Shield", Shield, "Shield"],
  ["Target", Target, "Target"],
  ["Crosshair", Crosshair, "Crosshair"],
  // Transport
  ["Rocket", Rocket, "Rocket"],
  ["RocketLaunch", RocketLaunch, "Liftoff"],
  ["Airplane", Airplane, "Airplane"],
  ["Car", Car, "Car"],
  ["Jeep", Jeep, "Jeep"],
  ["Motorcycle", Motorcycle, "Motorcycle"],
  ["Scooter", Scooter, "Scooter"],
  ["Sailboat", Sailboat, "Sailboat"],
  ["Bicycle", Bicycle, "Bicycle"],
  ["Train", Train, "Train"],
  ["Parachute", Parachute, "Parachute"],
  // Places & Structures
  ["House", House, "House"],
  ["Lighthouse", Lighthouse, "Lighthouse"],
  ["CastleTurret", CastleTurret, "Castle"],
  ["Bridge", Bridge, "Bridge"],
  ["Barn", Barn, "Barn"],
  ["Factory", Factory, "Factory"],
  // People & Social
  ["Users", Users, "Users"],
  ["UserCircle", UserCircle, "User"],
  ["CowboyHat", CowboyHat, "Cowboy Hat"],
  ["Sunglasses", Sunglasses, "Sunglasses"],
  // Objects
  ["Heart", Heart, "Heart"],
  ["Star", Star, "Star"],
  ["Diamond", Diamond, "Diamond"],
  ["Gift", Gift, "Gift"],
  ["Bell", Bell, "Bell"],
  ["Flag", Flag, "Flag"],
  ["Key", Key, "Key"],
  ["Lock", Lock, "Lock"],
  ["Compass", Compass, "Compass"],
  ["Globe", Globe, "Globe"],
  ["MapPin", MapPin, "Map Pin"],
  ["Anchor", Anchor, "Anchor"],
  ["Briefcase", Briefcase, "Briefcase"],
  ["Magnet", Magnet, "Magnet"],
  ["Lamp", Lamp, "Lamp"],
  ["Broom", Broom, "Broom"],
  ["Eye", Eye, "Eye"],
  // Health & Body
  ["Heartbeat", Heartbeat, "Heartbeat"],
  ["Tooth", Tooth, "Tooth"],
  ["Fingerprint", Fingerprint, "Fingerprint"],
  // Time & Tools
  ["Hourglass", Hourglass, "Hourglass"],
  ["Clock", Clock, "Clock"],
  ["Calendar", Calendar, "Calendar"],
  ["Umbrella", Umbrella, "Umbrella"],
  ["Scissors", Scissors, "Scissors"],
  ["Wrench", Wrench, "Wrench"],
  ["Hammer", Hammer, "Hammer"],
  // Shapes
  ["Hexagon", Hexagon, "Hexagon"],
  ["Octagon", Octagon, "Octagon"],
];

const PHOSPHOR_MAP: Record<string, PhosphorIcon> = Object.fromEntries(
  PHOSPHOR_ICONS.map(([key, component]) => [key, component])
);

const DEFAULT_ICON = Robot;

export function renderIcon(icon: Icon, className: string = "h-4 w-4") {
  if (icon.type === "emoji") {
    return <span className={className} style={{ fontSize: "1em", lineHeight: 1 }}>{icon.value}</span>;
  }
  if (icon.type === "image") {
    return (
      <Image
        src={`/api/workspace-icons/${icon.imageId}?ext=${icon.ext}`}
        alt=""
        width={16}
        height={16}
        unoptimized
        className={`${className} rounded-full object-cover`}
      />
    );
  }
  const PhIcon = PHOSPHOR_MAP[icon.name] ?? DEFAULT_ICON;
  return <PhIcon className={className} weight="duotone" />;
}

export default function IconPicker({
  value,
  onChange,
  enableUpload = false,
}: {
  value?: Icon;
  onChange: (icon: Icon) => void;
  enableUpload?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"icons" | "emoji" | "upload">(
    value?.type === "emoji" ? "emoji" : value?.type === "image" ? "upload" : "icons"
  );
  const [emojiInput, setEmojiInput] = useState(value?.type === "emoji" ? value.value : "");
  const [uploading, setUploading] = useState(false);

  const filtered = PHOSPHOR_ICONS.filter(([, , label]) =>
    label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setMode("icons")}
          className={`rounded px-2 py-1 text-xs font-medium ${
            mode === "icons" ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600"
          }`}
        >
          Icons
        </button>
        <button
          type="button"
          onClick={() => setMode("emoji")}
          className={`rounded px-2 py-1 text-xs font-medium ${
            mode === "emoji" ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600"
          }`}
        >
          Emoji
        </button>
        {enableUpload && (
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`rounded px-2 py-1 text-xs font-medium ${
              mode === "upload" ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600"
            }`}
          >
            Upload
          </button>
        )}
      </div>

      {mode === "icons" ? (
        <>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search icons..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <div className="grid max-h-[160px] grid-cols-6 md:grid-cols-8 gap-1 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-600 p-2">
            {filtered.map(([key, PhIcon, label]) => {
              const isSelected = value?.type === "phosphor" && value.name === key;
              return (
                <button
                  key={key}
                  type="button"
                  title={label}
                  onClick={() => onChange({ type: "phosphor", name: key })}
                  className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
                    isSelected
                      ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 ring-1 ring-violet-500"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  }`}
                >
                  <PhIcon className="h-4 w-4" weight="duotone" />
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-6 md:col-span-8 py-3 text-center text-xs text-zinc-400 dark:text-zinc-500">No icons found</div>
            )}
          </div>
        </>
      ) : mode === "upload" ? (
        <div className="space-y-2">
          {value?.type === "image" && (
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <Image
                src={`/api/workspace-icons/${value.imageId}?ext=${value.ext}`}
                alt=""
                width={32}
                height={32}
                unoptimized
                className="h-8 w-8 rounded-full object-cover"
              />
              <span>Current image</span>
            </div>
          )}
          <label className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-600 p-4 cursor-pointer hover:border-violet-400 dark:hover:border-violet-500 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
            <Upload className="h-4 w-4 text-zinc-400" />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {uploading ? "Uploading..." : "Choose image (PNG, JPG, GIF, WebP)"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                try {
                  const formData = new FormData();
                  formData.append("file", file);
                  const res = await fetch("/api/workspace-icons", { method: "POST", body: formData });
                  if (!res.ok) {
                    const data = await res.json();
                    alert(data.error || "Upload failed");
                    return;
                  }
                  const { imageId, ext } = await res.json();
                  onChange({ type: "image", imageId, ext });
                } catch {
                  alert("Upload failed");
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Max 2MB</p>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={emojiInput}
            onChange={(e) => {
              setEmojiInput(e.target.value);
              if (e.target.value.trim()) {
                onChange({ type: "emoji", value: e.target.value.trim() });
              }
            }}
            placeholder="Enter an emoji..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-2.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            maxLength={4}
          />
          {emojiInput && (
            <span className="text-2xl">{emojiInput}</span>
          )}
        </div>
      )}
    </div>
  );
}
