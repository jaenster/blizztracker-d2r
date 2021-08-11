import axios from "axios";
import {persist} from "./PersistentData";
import {NodeHtmlMarkdown} from "node-html-markdown";

/**
 * String.prototype.replaceAll() polyfill
 * https://gomakethings.com/how-to-replace-a-section-of-a-string-with-another-one-with-vanilla-js/
 * @author Chris Ferdinandi
 * @license MIT
 */
if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (str, newStr) {

        // If a regex pattern
        if (Object.prototype.toString.call(str).toLowerCase() === '[object regexp]') {
            return this.replace(str, newStr);
        }

        // If a string
        return this.replace(new RegExp(str, 'g'), newStr);

    };
}

namespace Blizzard {
    export interface Link {
        url: string,
        internal: boolean,
        reflection: false,
        title: string,
        clicks: number
    }

    export interface Details {
        can_edit: boolean,
        participants: User[],
        created_by: User,
        last_poster: User,
        links: Link[]
    }

    export interface TrackedPost {
        group: GroupEnum.CommunityManager,
        post_number: number
    }

    export enum PosterType {
        OriginalPoster = 'Original Poster',
        FrequentPoster = 'Frequent Poster',
        MostRecentPoster = 'Most Recent Poster',
    }

    export interface Poster {
        extras: null | 'latest',
        description: PosterType,
        user_id: number,
        primary_group_id: null | number,
    }

    export interface User {
        id: number
        username: string
        name: null | string
        avatar_template: string
        primary_group_name: string
        admin?: boolean
        moderator?: boolean
        trust_level: 0 | 1 | 2 | 3 | 4
    }

    export enum GroupEnum {
        CommunityManager = "community-manager",
    }

    export interface TopicSummary {
        id: number
        title: string
        fancy_title: string
        slug: string
        posts_count: number
        reply_count: number
        highest_post_number: number
        image_url: null | string
        created_at: string
        last_posted_at: string
        bumped: true
        bumped_at: string
        archetype: string
        unseen: boolean
        pinned: boolean
        unpinned: null
        excerpt: string
        visible: boolean
        closed: boolean
        archived: boolean
        bookmarked: null
        liked: null
        views: number
        like_count: number
        has_summary: boolean
        last_poster_username: string
        category_id: number
        pinned_globally: boolean
        featured_link: null
        first_tracked_post?: TrackedPost
        has_accepted_answer: boolean
        posters: Poster[]
    }

    export interface Latest {
        users: ReadonlyArray<User>,
        topic_list: {
            can_create_topic: boolean,
            more_topic_url: string,
            topics: ReadonlyArray<TopicSummary>,
        }
    }

    export interface Post {
        id: number
        name: null
        username: string
        avatar_template: string
        created_at: string
        cooked: string
        post_number: number
        post_type: number
        updated_at: number
        reply_count: number
        reply_to_post_number: number | null
        quote_count: number
        incoming_link_count: number
        reads: number
        readers_count: number
        score: number
        yours: false
        topic_id: number
        topic_slug: string
        display_username: string | null
        primary_group_name: string | null
        primary_group_flair_url: string | null
        primary_group_flair_bg_color: string | null
        primary_group_flair_color: string | null
        version: number
        can_edit: boolean
        can_delete: boolean
        can_recover: boolean
        can_wiki: boolean
        link_counts: Link[],
        read: boolean
        user_title: string
        bookmarked: boolean
        action_summary: { id: number, count: number }[],
        moderator: boolean
        admin: boolean
        staff: boolean
        user_id: number
        hidden: boolean
        trust_level: number
        deleted_at: null | string
        user_deleted: boolean
        edit_reason: null | string
        can_view_edit_history: boolean
        wiki: boolean
        user_custom_fields: {
            blizzard_post_count: string
            profile_url: string
        }
        user_post_count: number,
        can_accept_answer: boolean,
        can_unaccept_answer: boolean,
        accepted_answer: boolean,
    }

    export interface PostStream {
        posts: Post[],
        stream: number[]
    }

    export interface TopicFull {
        post_stream: PostStream,
        timeline_lookup: [number, number][],
        id: number
        title: string
        fancy_title: string
        posts_count: number
        created_at: string
        views: number
        reply_count: number
        like_count: number
        last_posted_at: string
        visible: boolean
        closed: boolean
        archived: boolean
        has_summary: boolean
        archetype: string
        slug: string
        category_id: number
        word_count: number
        deleted_at: string | null
        user_id: number
        featured_link: string | null
        pinned_globally: boolean
        pinned_at: string
        pinned_until: string
        image_url: string | null
        slow_mode_seconds: number
        draft: string | null
        draft_key: string
        draft_sequence: string | null
        unpinned: string | null
        pinned: boolean
        current_post_number: number
        highest_post_number: number
        deleted_by: string | null
        actions_summary: { id: number, count: number, hidden: boolean, can_act: boolean }[],
        chunk_size: number
        bookmarked: boolean
        topic_timer: null | string
        message_bus_last_id: number
        participant_count: number
        show_read_indicator: boolean
        thumbnails: string | null
        slow_mode_enabled_until: string | null
        first_tracked_post?: TrackedPost,
        tracked_posts: TrackedPost[],
        details: Details,
    }

    export interface PostFetchResponse {
        post_stream: PostStream,
        id: number,
    }
}

interface StoredData {
    topics: {
        post_number: number,
        id: number
    }[],
}

const persistData = persist<StoredData>({
    topics: [],
}, './tracking-data.json')

const settings = persist({
    webhooks: [] as string[],
}, './tracking-data.json')

async function readTopic(id: number) {
    const {data} = await axios(`https://us.forums.blizzard.com/en/d3/t/${id}.json?forceLoad=true`);
    const num = 20;
    const chunks = Math.floor(data.post_stream.stream.length / num) + 1;

    // Blizzards forums are pretty stupid. I could simply get only the blue posts of data.tracked_posts as those are the blue posts
    // however, the order of the post number is not in order after they deleted someones post
    // so all posts needs to be fetched, and see which post number is the actual post number mentioned in tracked_post
    // as simply:
    /*  data.tracked_posts.map(el => data.post_stream.stream[el.post_number-1]); */
    // can have the wrong offset if they deleted a post
    const allRealPostsOfTopic = Array.from(data.post_stream.posts) as Blizzard.Post[];
    for (let i = 1; i < chunks; i++) {
        const postIds = data.post_stream.stream.slice(i * num, (i * num) + num);

        const {data: postData} = await axios(`https://us.forums.blizzard.com/en/d3/t/${id}/posts.json?post_ids%5B%5D=${postIds.join('&post_ids%5B%5D=')}&include_suggested=true`)
        if (postData.post_stream.posts) allRealPostsOfTopic.push(...postData.post_stream.posts);
    }

    // Fetch the special posts
    if (data.tracked_posts) {
        const specialPosts = data
            .tracked_posts
            // filter out posts that we already had
            .filter(el => !persistData.topics.find(per => per.id === id && per.post_number === el.post_number))
            // get those posts
            .map(el => allRealPostsOfTopic.find(post => post.post_number === el.post_number) as Blizzard.Post)


        for (const post of specialPosts) {
            await spamDiscordFromPost(post);

            persistData.topics.push({post_number: post.post_number, id});
        }
    }
}

async function getLatest() {
    const {
        data,
        status
    } = await axios.get<Blizzard.Latest>('https://us.forums.blizzard.com/en/d3/c/d2r/d2r-general-discussion/49/l/latest.json?ascending=false')
    if (status !== 200) {
        console.error('Failed to fetch data');
    }

    const topicsWithBluePosts = data.topic_list.topics.filter(({first_tracked_post}) => first_tracked_post);

    for (let i = 0; i < topicsWithBluePosts.length; i++) {
        const currentTopic = topicsWithBluePosts[i];
        await readTopic(currentTopic.id);
    }
}


async function spamDiscordFromPost(post: Blizzard.Post) {
    const original = NodeHtmlMarkdown.translate(post.cooked);
    let readable = original.substr(0, 1000);
    if (original.length > readable.length) {
        readable = readable.substr(0, readable.lastIndexOf(' ')) + '...';
    }

    let avatar = post.avatar_template;
    if (!avatar.startsWith('https:') && !avatar.startsWith('http:')) {
        if (avatar.startsWith('//')) avatar = 'https:' + avatar;
        else avatar = 'https://' + avatar;
    }
    const data = {
        "content": null,
        "embeds": [
            {
                "title": post.user_title,
                "color": 1016495,
                "fields": [
                    {
                        "name": 'Blue post',
                        "value": readable,
                    }
                ],
                "url": `https://us.forums.blizzard.com/en/d3/t/july-13-d2r-news-technical-alpha-learnings/${post.topic_id}/${post.post_number}`,
                "author": {
                    "name": post.username,
                    "icon_url": avatar,
                    "url": `https://us.forums.blizzard.com/en/d3/t/july-13-d2r-news-technical-alpha-learnings/${post.topic_id}/${post.post_number}`,
                },
                "footer": {
                    "text": "Blue tracker",
                    "icon_url": "https://images-ext-2.discordapp.net/external/tGW-Uz-P7mSECqNW5hRZewySFrae7piAdbHlglIlerU/https/i.imgur.com/2rB8UeO.png",
                },
                "timestamp": post.created_at
            }
        ]
    };

    for (const hook of settings.webhooks) {
        try {
            await axios.post(hook, data, {headers: {'Content-Type': 'application/json',},})
        } catch (e) {
            console.log(e);
            console.log(JSON.stringify(data))
        }
    }
}

(async function doIt() {
    await getLatest()
    setTimeout(doIt, 1000 * 60 * 15);
})();
